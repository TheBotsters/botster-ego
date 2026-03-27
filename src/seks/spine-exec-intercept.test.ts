import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpineConfig, SpineCommandResult } from "./spine-client.js";

// We need to mock spine-client before importing the intercept module
vi.mock("./spine-client.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./spine-client.js")>();
  return {
    ...original,
    spineExec: vi.fn(),
    spineActuatorList: vi.fn(),
    spineActuatorSelected: vi.fn(),
    spineActuatorSelect: vi.fn(),
  };
});

import { spineExec } from "./spine-client.js";
import {
  createSpineExecTool,
  createSpineProcessTool,
  createSpineReadTool,
  createSpineWriteTool,
  createSpineEditTool,
} from "./spine-exec-intercept.js";

const mockSpineExec = vi.mocked(spineExec);

const testConfig: SpineConfig = {
  brokerUrl: "http://broker.test",
  agentToken: "test-token",
};

function makeMockTool(name: string) {
  return {
    name,
    label: name,
    description: `Mock ${name} tool`,
    parameters: { type: "object" as const, properties: {} },
    execute: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "local result" }],
    }),
  };
}

describe("createSpineExecTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes exec through spine and returns result", async () => {
    const completedResult: SpineCommandResult = {
      status: "completed",
      result: { stdout: "siofra_actuator\n", exitCode: 0, durationMs: 5 },
    };
    mockSpineExec.mockResolvedValue(completedResult);

    const tool = createSpineExecTool(makeMockTool("exec"), testConfig);
    const result = await tool.execute("call-1", { command: "whoami" });

    expect(mockSpineExec).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        capability: "exec",
        payload: expect.objectContaining({ command: "whoami" }),
      }),
    );
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("siofra_actuator");
    expect(result.details.status).toBe("completed");
    expect(result.details.exitCode).toBe(0);
  });

  it("handles timeout result from spine", async () => {
    mockSpineExec.mockResolvedValue({
      status: "timeout",
      message: "Spine command timed out after 30000ms",
    });

    const tool = createSpineExecTool(makeMockTool("exec"), testConfig);
    const result = await tool.execute("call-1", { command: "sleep 999" });

    expect(result.details.status).toBe("failed");
    expect((result.content[0] as { type: "text"; text: string }).text).toContain("timed out");
  });

  it("throws when result is null (no actuator)", async () => {
    mockSpineExec.mockResolvedValue({
      status: "completed",
      result: null,
    });

    const tool = createSpineExecTool(makeMockTool("exec"), testConfig);
    await expect(tool.execute("call-1", { command: "whoami" })).rejects.toThrow(
      "No actuator available",
    );
  });

  it("handles running status with session id", async () => {
    mockSpineExec.mockResolvedValue({
      status: "running",
      command_id: "cmd-42",
      result: { sessionId: "sess-1", pid: 1234, tail: "partial output..." },
    });

    const tool = createSpineExecTool(makeMockTool("exec"), testConfig);
    const result = await tool.execute("call-1", { command: "long-process", background: true });

    expect(result.details.status).toBe("running");
    expect(result.details.sessionId).toBe("sess-1");
    expect(result.details.pid).toBe(1234);
  });

  it("handles failed status with stderr", async () => {
    mockSpineExec.mockResolvedValue({
      status: "failed",
      result: { stderr: "permission denied", exitCode: 1 },
    });

    const tool = createSpineExecTool(makeMockTool("exec"), testConfig);
    const result = await tool.execute("call-1", { command: "cat /root/secret" });

    expect(result.details.status).toBe("failed");
    expect(result.details.exitCode).toBe(1);
    expect((result.content[0] as { type: "text"; text: string }).text).toContain(
      "permission denied",
    );
  });

  it("returns base tool unchanged when execute is undefined", () => {
    const noExec = {
      name: "exec",
      label: "exec",
      description: "test",
      parameters: { type: "object" as const, properties: {} },
    } as Parameters<typeof createSpineExecTool>[0]; // intentionally missing execute — testing the no-execute fallback path
    const tool = createSpineExecTool(noExec, testConfig);
    expect(tool.execute).toBeUndefined();
  });

  it("passes workdir and env through to spine payload", async () => {
    mockSpineExec.mockResolvedValue({
      status: "completed",
      result: { stdout: "ok", exitCode: 0 },
    });

    const tool = createSpineExecTool(makeMockTool("exec"), testConfig);
    await tool.execute("call-1", { command: "ls", workdir: "/tmp", env: { FOO: "bar" } });

    expect(mockSpineExec).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        payload: expect.objectContaining({
          command: "ls",
          cwd: "/tmp",
          env: { FOO: "bar" },
        }),
      }),
    );
  });
});

describe("createSpineProcessTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes through spine with 'process' capability", async () => {
    mockSpineExec.mockResolvedValue({
      status: "completed",
      result: { stdout: "session output", exitCode: 0 },
    });

    const tool = createSpineProcessTool(makeMockTool("process"), testConfig);
    await tool.execute("call-1", { action: "poll", sessionId: "sess-1" });

    expect(mockSpineExec).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        capability: "process",
      }),
    );
  });

  it("throws on null result (no actuator)", async () => {
    mockSpineExec.mockResolvedValue({
      status: "completed",
      result: null,
    });

    const tool = createSpineProcessTool(makeMockTool("process"), testConfig);
    await expect(tool.execute("call-1", {})).rejects.toThrow("No actuator available");
  });
});

describe("createSpineReadTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes through spine with 'read' capability", async () => {
    mockSpineExec.mockResolvedValue({
      status: "completed",
      result: { content: "file contents here" },
    });

    const tool = createSpineReadTool(makeMockTool("read"), testConfig);
    const result = await tool.execute("call-1", { file_path: "/workspace/SOUL.md" });

    expect(mockSpineExec).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        capability: "read",
        payload: { file_path: "/workspace/SOUL.md" },
      }),
    );
    expect((result.content[0] as { type: "text"; text: string }).text).toContain(
      "file contents here",
    );
  });
});

describe("createSpineWriteTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes through spine with 'write' capability", async () => {
    mockSpineExec.mockResolvedValue({
      status: "completed",
      result: { content: "written" },
    });

    const tool = createSpineWriteTool(makeMockTool("write"), testConfig);
    await tool.execute("call-1", { file_path: "/tmp/test.txt", content: "hello" });

    expect(mockSpineExec).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        capability: "write",
      }),
    );
  });
});

describe("createSpineEditTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes through spine with 'edit' capability", async () => {
    mockSpineExec.mockResolvedValue({
      status: "completed",
      result: { content: "edited" },
    });

    const tool = createSpineEditTool(makeMockTool("edit"), testConfig);
    await tool.execute("call-1", { file_path: "/tmp/test.txt", old_string: "a", new_string: "b" });

    expect(mockSpineExec).toHaveBeenCalledWith(
      testConfig,
      expect.objectContaining({
        capability: "edit",
      }),
    );
  });
});
