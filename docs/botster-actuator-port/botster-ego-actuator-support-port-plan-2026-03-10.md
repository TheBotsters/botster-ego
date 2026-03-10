# Implementation Plan — Port Actuator/Spine Support to `TheBotsters/botster-ego`
Date: 2026-03-10
Author: FootGun
Input report: `botster-ego-port-status-and-actuator-routing-report-2026-03-10.md`

---

## Goal

Enable `TheBotsters/botster-ego` to behave equivalently to current `BotstersDev/botster-brain` deployment for:

1. Superego-mediated broker routing
2. SEKS spine interception for critical tools (`exec/process/read/write/edit`)
3. Existing sister architecture (superego + actuator + ego sidecar) without identity drift

So we can migrate sisters from `/opt/botster-brain-test` to `/opt/botster-ego-dev` safely.

---

## Scope

### In scope
- Runtime parity for SEKS spine path and tool interception
- Config/env compatibility with current superego TOML expectations
- End-to-end routing verification to actuators
- One-sister staged cutover process

### Out of scope
- Re-architecting broker protocol
- Redesigning sister account topology
- Broad OpenClaw feature upgrades unrelated to actuator path

---

## Known baseline

Current known-good runtime:
- `/opt/botster-brain-test`
- repo/commit: `BotstersDev/botster-brain @ ecf3021a1`

Observed parity gap (now source-traced):
- In brain source:
  - `src/seks/spine-client.ts` (reads `SEKS_BROKER_URL`, defines broker-backed spine exec path)
  - `src/seks/spine-exec-intercept.ts` (wrappers for `exec/process/read/write/edit`)
  - `src/agents/pi-tools.ts` imports spine modules and conditionally wraps tool assembly via `getSpineConfig` + `createSpine*` hooks
- In ego source (`v2026.3.2`), equivalent spine modules/hook references are absent by grep:
  - no `src/seks/spine-*`
  - no `getSpineConfig` / `createSpine*` references in agent tool assembly
  - no `BOTSTER_EXEC_VIA_SPINE` / `SEKS_BROKER_URL` routing references found in relevant source search

Implication:
- Existing superego env contract (`SEKS_BROKER_URL` + `BOTSTER_EXEC_VIA_SPINE=1`) is actively consumed by brain fork routing code, but not currently consumed by equivalent code paths in ego fork.

---

## Deliverables

1. **Parity matrix** (brain vs ego)
   - files/modules/env vars/tool hooks
2. **Port patch set** in `TheBotsters/botster-ego`
   - SEKS spine client + interception integration
3. **Compatibility test suite**
   - unit + staging integration checks
4. **Migration runbook update**
   - go/no-go gates for sister cutover
5. **Pilot cutover evidence**
   - Aeon test pass/fail logs and rollback outcome

---

## Phase 1 — Diff + Design (Read-only analysis)

### 1.1 Build a source-level parity map
Compare source (not only dist) between:
- `BotstersDev/botster-brain @ ecf3021a1`
- `TheBotsters/botster-ego` target branch/tag

Focus areas:
- `seks/spine-client`
- `seks/spine-exec-intercept`
- tool registry wiring for exec/process/read/write/edit
- env parsing for `SEKS_BROKER_URL`, `BOTSTER_EXEC_VIA_SPINE`
- any gateway bootstrap hooks required for spine path

### 1.2 Produce explicit gap list
For each missing behavior:
- what is missing
- where it must hook in
- acceptance criterion

Output artifact:
- `docs/actuator-parity-gap-analysis.md` (in repo branch)

---

## Phase 2 — Implement Port in `botster-ego`

### 2.1 Reintroduce/port spine modules
- Port or reimplement brain-equivalent modules in ego fork:
  - `src/seks/spine-client.ts`
  - `src/seks/spine-exec-intercept.ts`
- Ensure `spine-client` reads `SEKS_BROKER_URL` and provides spine execution API.
- Ensure interception wrappers cover:
  - `exec`
  - `process`
  - `read`
  - `write`
  - `edit`

### 2.2 Hook wrappers into tool construction path
- Add brain-equivalent hook points in agent tool assembly (`src/agents/pi-tools.ts` equivalent path):
  - import `getSpineConfig` + `createSpine*` wrappers
  - build `baseWithSpine` for read/write/edit
  - wrap exec/process when spine config resolves
- Ensure activation logic follows env/config gate:
  - enabled when `BOTSTER_EXEC_VIA_SPINE=1` and broker URL present

### 2.3 Preserve non-spine behavior
- If spine gate off, default tool behavior must remain unchanged.

### 2.4 Add diagnostics
- startup log line indicating spine mode status (enabled/disabled + reason)
- lightweight telemetry around routed calls and failure modes

---

## Phase 3 — Test Strategy

### 3.1 Unit tests
- spine config parsing
- wrapper activation conditions
- tool call mapping correctness
- error mapping (`failed`, `timeout`, malformed payload)

### 3.2 Integration tests (staging)
On isolated staging runtime path:
1. start gateway under superego proxy
2. run test tool calls through each wrapped tool
3. verify command reaches broker/actuator and response returns correctly

### 3.3 Regression checks
- sister heartbeats
- model switching
- channel health monitor behavior
- no identity/home path drift

---

## Phase 4 — Deployment Plan (One-sister pilot)

### 4.1 Pre-cutover gates
- staging build success
- spine integration tests pass
- no critical config validation errors
- rollback directory prepared

### 4.2 Pilot (Aeon only)
- switch `aeonbyte.toml` args path to validated `botster-ego` runtime
- restart only `aeon.service`
- verify:
  - service stability
  - actuator-routed tool calls
  - heartbeat + email path

### 4.3 Soak + decision
- observe for fixed interval
- if stable, promote runbook for Annie/Nira/Síofra
- if unstable, rollback immediately and capture failure packet

---

## Rollback Plan

At any failure gate:
1. stop target sister service
2. repoint args back to `/opt/botster-brain-test/openclaw.mjs`
3. start service
4. verify baseline behavior restored
5. attach logs + root-cause notes to incident file

---

## Risks and mitigations

1. **Hidden coupling to brain fork internals**
   - Mitigation: source-level parity matrix before coding
2. **Config schema drift between versions**
   - Mitigation: explicit config compatibility tests in staging
3. **Identity/context drift (ego vs actuator assumptions)**
   - Mitigation: add preflight assertions for `whoami`, `HOME`, and routed tool path
4. **False positives from dist-grep alone**
   - Mitigation: verify source hooks + live integration tests

---

## Proposed execution order (practical)

1. Create feature branch in `TheBotsters/botster-ego`
2. Add parity-gap doc
3. Port spine code + hooks
4. Add tests + diagnostics
5. Build staging artifact on VPS
6. Run integration suite
7. Pilot cutover Aeon
8. Promote or rollback

---

## Success criteria

Port is considered successful when all are true:
- Actuator-routed tool path works on `botster-ego` exactly as on `botster-brain`
- Sister service remains stable under normal heartbeat and interactive load
- No required cross-user secret/config migration
- Rollback remains one-step and tested

---

## Immediate next action

Start Phase 1 by generating the source-level parity map between the two repos at pinned commits/tags.
