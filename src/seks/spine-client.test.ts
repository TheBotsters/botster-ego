import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSpineConfig,
  spineExec,
  spineActuatorList,
  spineActuatorSelect,
} from "./spine-client.js";
import type { SpineConfig } from "./spine-client.js";

// ─── getSpineConfig ─────────────────────────────────────────────────────────

describe("getSpineConfig", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when BOTSTER_EXEC_NORMAL=1", () => {
    vi.stubEnv("BOTSTER_EXEC_NORMAL", "1");
    vi.stubEnv("SEKS_BROKER_URL", "http://broker.test");
    expect(getSpineConfig()).toBeNull();
  });

  it("returns null when SEKS_BROKER_URL is unset", () => {
    delete process.env.SEKS_BROKER_URL;
    delete process.env.BOTSTER_EXEC_NORMAL;
    expect(getSpineConfig()).toBeNull();
  });

  it("returns null when SEKS_BROKER_URL is empty", () => {
    vi.stubEnv("SEKS_BROKER_URL", "  ");
    expect(getSpineConfig()).toBeNull();
  });

  it("returns config with trimmed brokerUrl and trailing slash stripped", () => {
    vi.stubEnv("SEKS_BROKER_URL", "  http://broker.test/  ");
    vi.stubEnv("SEKS_BROKER_TOKEN", "tok123");
    delete process.env.BOTSTER_EXEC_NORMAL;
    const cfg = getSpineConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.brokerUrl).toBe("http://broker.test");
    expect(cfg!.agentToken).toBe("tok123");
  });

  it("uses 'superego-proxy' as token when SEKS_BROKER_TOKEN is unset", () => {
    vi.stubEnv("SEKS_BROKER_URL", "http://broker.test");
    delete process.env.SEKS_BROKER_TOKEN;
    delete process.env.BOTSTER_EXEC_NORMAL;
    const cfg = getSpineConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.agentToken).toBe("superego-proxy");
  });

  it("BOTSTER_EXEC_NORMAL takes priority even when SEKS_BROKER_URL is set", () => {
    vi.stubEnv("BOTSTER_EXEC_NORMAL", "1");
    vi.stubEnv("SEKS_BROKER_URL", "http://broker.test");
    vi.stubEnv("SEKS_BROKER_TOKEN", "tok123");
    expect(getSpineConfig()).toBeNull();
  });
});

// ─── spineExec ──────────────────────────────────────────────────────────────

describe("spineExec", () => {
  const config: SpineConfig = {
    brokerUrl: "http://broker.test",
    agentToken: "test-token",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns result on completed status", async () => {
    const body = {
      status: "completed",
      command_id: "cmd-1",
      result: { stdout: "hello\n", exitCode: 0 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(body),
      }),
    );

    const result = await spineExec(config, {
      capability: "exec",
      payload: { command: "echo hello" },
    });
    expect(result.status).toBe("completed");
    expect(result.command_id).toBe("cmd-1");
    expect(result.result?.stdout).toBe("hello\n");
    expect(result.result?.exitCode).toBe(0);
  });

  it("returns failed status from broker", async () => {
    const body = {
      status: "failed",
      message: "command failed",
      result: { error: "segfault", exitCode: 139 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(body),
      }),
    );

    const result = await spineExec(config, {
      capability: "exec",
      payload: { command: "bad" },
    });
    expect(result.status).toBe("failed");
    expect(result.message).toBe("command failed");
    expect(result.result?.exitCode).toBe(139);
  });

  it("returns timeout when fetch is aborted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );

    const result = await spineExec(config, {
      capability: "exec",
      payload: { command: "sleep 999" },
      timeout_ms: 50,
    });
    expect(result.status).toBe("timeout");
    expect(result.message).toContain("timed out");
  });

  it("throws on non-200 response with message from body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: "Forbidden: capability not granted" }),
      }),
    );

    await expect(
      spineExec(config, { capability: "exec", payload: { command: "whoami" } }),
    ).rejects.toThrow("Forbidden: capability not granted");
  });

  it("throws on non-200 response with fallback message when body parse fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      }),
    );

    await expect(
      spineExec(config, { capability: "exec", payload: { command: "whoami" } }),
    ).rejects.toThrow("Broker request failed with HTTP 500");
  });

  it("throws when broker is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      spineExec(config, { capability: "exec", payload: { command: "whoami" } }),
    ).rejects.toThrow("Spine unreachable");
  });

  it("returns result=null when broker returns null result (no actuator)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "completed", result: null }),
      }),
    );

    const result = await spineExec(config, {
      capability: "exec",
      payload: { command: "whoami" },
    });
    expect(result.status).toBe("completed");
    expect(result.result).toBeNull();
  });

  it("throws on invalid response payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      }),
    );

    await expect(
      spineExec(config, { capability: "exec", payload: { command: "whoami" } }),
    ).rejects.toThrow("Invalid spine response payload");
  });

  it("sends correct request format to broker", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "completed", result: { stdout: "ok" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await spineExec(config, {
      capability: "exec",
      payload: { command: "whoami" },
      timeout_ms: 5000,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://broker.test/v1/command",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    );

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sentBody.capability).toBe("exec");
    expect(sentBody.sync).toBe(true);
    expect(sentBody.timeout_ms).toBe(5000);
  });
});

// ─── Actuator management ────────────────────────────────────────────────────

describe("spineActuatorList", () => {
  const config: SpineConfig = {
    brokerUrl: "http://broker.test",
    agentToken: "test-token",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns actuator list from broker", async () => {
    const actuators = [
      {
        id: "a1",
        name: "vps",
        type: "vps",
        status: "online",
        enabled: true,
        last_seen_at: "2026-01-01T00:00:00Z",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(actuators),
      }),
    );

    const result = await spineActuatorList(config);
    expect(result).toEqual(actuators);
  });

  it("throws on non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );

    await expect(spineActuatorList(config)).rejects.toThrow("Failed to list actuators: HTTP 401");
  });
});

describe("spineActuatorSelect", () => {
  const config: SpineConfig = {
    brokerUrl: "http://broker.test",
    agentToken: "test-token",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends select request and returns result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, selected_actuator_id: "a1" }),
      }),
    );

    const result = await spineActuatorSelect(config, "a1");
    expect(result.ok).toBe(true);
    expect(result.selected_actuator_id).toBe("a1");
  });
});
