export interface SpineConfig {
  brokerUrl: string;
  agentToken: string;
}

export interface SpineCommandResult {
  status: "completed" | "failed" | "running" | "timeout";
  command_id?: string;
  result?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    durationMs?: number;
    error?: string;
    sessionId?: string;
    pid?: number;
    content?: string;
    sessions?: unknown[];
    tail?: string;
  } | null;
  message?: string;
}

function normalizeBrokerUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function normalizeTimeoutMs(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 30_000;
  }
  return Math.floor(value);
}

function resolveErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
  }
  return `Broker request failed with HTTP ${status}`;
}

export function getSpineConfig(): SpineConfig | null {
  if (process.env.BOTSTER_EXEC_NORMAL === "1") {
    return null;
  }
  const brokerUrl = process.env.SEKS_BROKER_URL?.trim();
  if (!brokerUrl) {
    return null;
  }
  // agentToken: superego proxy injects real token; value here is irrelevant
  const agentToken = process.env.SEKS_BROKER_TOKEN?.trim() || "superego-proxy";
  return {
    brokerUrl: normalizeBrokerUrl(brokerUrl),
    agentToken,
  };
}

export async function spineExec(
  config: SpineConfig,
  payload: {
    capability: string;
    payload: unknown;
    timeout_ms?: number;
  },
): Promise<SpineCommandResult> {
  const timeoutMs = normalizeTimeoutMs(payload.timeout_ms);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${config.brokerUrl}/v1/command`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.agentToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        capability: payload.capability,
        payload: payload.payload,
        sync: true,
        timeout_ms: timeoutMs,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        status: "timeout",
        message: `Spine command timed out after ${timeoutMs}ms`,
      };
    }
    throw new Error(`Spine unreachable at ${config.brokerUrl}`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(resolveErrorMessage(response.status, body));
  }

  const data = (await response.json()) as unknown;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid spine response payload");
  }
  const record = data as Record<string, unknown>;
  const status = record.status;
  if (
    status !== "completed" &&
    status !== "failed" &&
    status !== "running" &&
    status !== "timeout"
  ) {
    throw new Error("Invalid spine status");
  }
  return {
    status,
    command_id: typeof record.command_id === "string" ? record.command_id : undefined,
    result:
      record.result && typeof record.result === "object"
        ? (record.result as SpineCommandResult["result"])
        : record.result === null
          ? null
          : undefined,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

// ─── Actuator Management (brain-level, not routed through actuator) ───────────

export interface ActuatorInfo {
  id: string;
  name: string;
  type: string;
  status: string;
  enabled: boolean;
  last_seen_at: string;
}

export interface ActuatorSelectedInfo {
  actuator_id: string | null;
  name?: string;
  status?: string;
  type?: string;
  message?: string;
}

export async function spineActuatorList(config: SpineConfig): Promise<ActuatorInfo[]> {
  const response = await fetch(`${config.brokerUrl}/v1/actuators`, {
    headers: {
      Authorization: `Bearer ${config.agentToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to list actuators: HTTP ${response.status}`);
  }
  return response.json() as Promise<ActuatorInfo[]>;
}

export async function spineActuatorSelected(config: SpineConfig): Promise<ActuatorSelectedInfo> {
  const response = await fetch(`${config.brokerUrl}/v1/actuator/selected`, {
    headers: {
      Authorization: `Bearer ${config.agentToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to get selected actuator: HTTP ${response.status}`);
  }
  return response.json() as Promise<ActuatorSelectedInfo>;
}

export async function spineActuatorSelect(
  config: SpineConfig,
  actuatorId: string,
): Promise<{ ok: boolean; selected_actuator_id: string }> {
  const response = await fetch(`${config.brokerUrl}/v1/actuator/select`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.agentToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ actuator_id: actuatorId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to select actuator: HTTP ${response.status}`);
  }
  return response.json() as Promise<{ ok: boolean; selected_actuator_id: string }>;
}
