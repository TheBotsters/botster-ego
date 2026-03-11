import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExecToolDetails } from "../agents/bash-tools.exec-types.js";
import type { SpineCommandResult, SpineConfig } from "./spine-client.js";
import { spineExec } from "./spine-client.js";

type ToolExecute = NonNullable<AgentTool<unknown>["execute"]>;

function isAgentToolResult(value: unknown): value is AgentToolResult<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as { content?: unknown };
  return Array.isArray(record.content);
}

function getResultText(result: SpineCommandResult): string {
  const lines: string[] = [];
  const payload = result.result;
  if (payload && typeof payload === "object") {
    if (typeof payload.stdout === "string" && payload.stdout.trim()) lines.push(payload.stdout);
    if (typeof payload.stderr === "string" && payload.stderr.trim()) lines.push(payload.stderr);
    if (typeof payload.error === "string" && payload.error.trim()) lines.push(payload.error);
    if (typeof payload.content === "string" && payload.content.trim()) lines.push(payload.content);
    if (typeof payload.tail === "string" && payload.tail.trim()) lines.push(payload.tail);
  }
  if (typeof result.message === "string" && result.message.trim()) lines.push(result.message);
  return lines.join("\n").trim();
}

function ensureActuatorAvailable(result: SpineCommandResult): void {
  if (result.status === "completed" && result.result === null) {
    throw new Error("No actuator available");
  }
}

function createTextResult(text: string, details: Record<string, unknown>): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function resolveExecTimeoutMs(args: Record<string, unknown>): number {
  const timeout = args.timeout;
  if (typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0) {
    return Math.min(Math.floor(timeout * 1000 + 5000), 65_000);
  }
  return 30_000;
}

function wrapToolExecute(tool: AgentTool<unknown>, execute: ToolExecute): AgentTool<unknown> {
  return {
    ...tool,
    execute,
  };
}

function mapExecResult(
  args: Record<string, unknown>,
  result: SpineCommandResult,
): AgentToolResult<ExecToolDetails> {
  ensureActuatorAvailable(result);

  if (result.status === "timeout") {
    return {
      content: [
        {
          type: "text",
          text: result.message || "Spine timed out waiting for command completion.",
        },
      ],
      details: {
        status: "failed",
        exitCode: null,
        durationMs: 0,
        aggregated: result.message || "Timed out waiting for spine.",
        cwd: typeof args.workdir === "string" ? args.workdir : undefined,
      },
    };
  }

  const payload = result.result && typeof result.result === "object" ? result.result : {};
  if (result.status === "running") {
    const sessionId =
      typeof payload.sessionId === "string"
        ? payload.sessionId
        : typeof result.command_id === "string"
          ? result.command_id
          : undefined;
    if (!sessionId) {
      throw new Error("Spine returned running status without session id");
    }
    return {
      content: [
        {
          type: "text",
          text:
            getResultText(result) ||
            `Command still running (session ${sessionId}). Use process for follow-up.`,
        },
      ],
      details: {
        status: "running",
        sessionId,
        pid: typeof payload.pid === "number" ? payload.pid : undefined,
        startedAt: Date.now(),
        cwd: typeof args.workdir === "string" ? args.workdir : undefined,
        tail: typeof payload.tail === "string" ? payload.tail : undefined,
      },
    };
  }

  const aggregated = getResultText(result);
  const completed = result.status === "completed";
  return {
    content: [{ type: "text", text: aggregated || "(no output)" }],
    details: {
      status: completed ? "completed" : "failed",
      exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
      durationMs: typeof payload.durationMs === "number" ? payload.durationMs : 0,
      aggregated,
      cwd: typeof args.workdir === "string" ? args.workdir : undefined,
    },
  };
}

function mapGenericSpineResult(result: SpineCommandResult): AgentToolResult<unknown> {
  ensureActuatorAvailable(result);

  if (result.status === "timeout") {
    return createTextResult(result.message || "Spine timed out waiting for command completion.", {
      status: "failed",
    });
  }

  if (isAgentToolResult(result.result)) {
    return result.result;
  }

  const payload = result.result && typeof result.result === "object" ? result.result : {};
  const status = result.status === "failed" ? "failed" : result.status;
  const details: Record<string, unknown> = {
    status,
  };
  if (typeof result.command_id === "string") details.commandId = result.command_id;
  if (Array.isArray(payload.sessions)) details.sessions = payload.sessions;
  if (typeof payload.exitCode === "number") details.exitCode = payload.exitCode;
  if (typeof payload.durationMs === "number") details.durationMs = payload.durationMs;
  return createTextResult(getResultText(result) || "(no output)", details);
}

export function createSpineExecTool(baseTool: AgentTool<unknown>, spineConfig: SpineConfig) {
  const baseExecute = baseTool.execute;
  if (!baseExecute) return baseTool;
  return wrapToolExecute(baseTool, async (_toolCallId, args) => {
    const params = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
    const result = await spineExec(spineConfig, {
      capability: "exec",
      payload: {
        command: params.command,
        cwd: params.workdir,
        timeout: params.timeout,
        env: params.env,
        pty: params.pty,
        background: params.background,
        yieldMs: params.yieldMs,
      },
      timeout_ms: resolveExecTimeoutMs(params),
    });
    return mapExecResult(params, result);
  });
}

export function createSpineProcessTool(baseTool: AgentTool<unknown>, spineConfig: SpineConfig) {
  const baseExecute = baseTool.execute;
  if (!baseExecute) return baseTool;
  return wrapToolExecute(baseTool, async (_toolCallId, args) => {
    const result = await spineExec(spineConfig, {
      capability: "process",
      payload: args,
    });
    return mapGenericSpineResult(result);
  });
}

export function createSpineReadTool(baseTool: AgentTool<unknown>, spineConfig: SpineConfig) {
  const baseExecute = baseTool.execute;
  if (!baseExecute) return baseTool;
  return wrapToolExecute(baseTool, async (_toolCallId, args) => {
    const result = await spineExec(spineConfig, {
      capability: "read",
      payload: args,
    });
    return mapGenericSpineResult(result);
  });
}

export function createSpineWriteTool(baseTool: AgentTool<unknown>, spineConfig: SpineConfig) {
  const baseExecute = baseTool.execute;
  if (!baseExecute) return baseTool;
  return wrapToolExecute(baseTool, async (_toolCallId, args) => {
    const result = await spineExec(spineConfig, {
      capability: "write",
      payload: args,
    });
    return mapGenericSpineResult(result);
  });
}

export function createSpineEditTool(baseTool: AgentTool<unknown>, spineConfig: SpineConfig) {
  const baseExecute = baseTool.execute;
  if (!baseExecute) return baseTool;
  return wrapToolExecute(baseTool, async (_toolCallId, args) => {
    const result = await spineExec(spineConfig, {
      capability: "edit",
      payload: args,
    });
    return mapGenericSpineResult(result);
  });
}
