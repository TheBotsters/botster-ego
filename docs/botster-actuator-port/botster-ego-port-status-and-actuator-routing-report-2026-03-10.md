# Botster-Ego Port Status + Actuator Routing Report
Date: 2026-03-10
Author: FootGun
Host: `our-house-in-the-middle`

## Executive Summary

You are **not** fully ported to `TheBotsters/botster-ego` in live runtime.

Current live sister gateways (Aeon, Annie, Nira, Síofra) all execute OpenClaw from:
- `/opt/botster-brain-test/openclaw.mjs`
- repo: `BotstersDev/botster-brain`
- commit: `ecf3021a1`

`/opt/botster-ego-dev` exists and is built (`TheBotsters/botster-ego @ v2026.3.2`), but is **not currently active** for sister gateway runtime.

Most importantly: `botster-brain-test` contains explicit SEKS spine interception code paths; `botster-ego-dev` (tested build) does not show those markers in `dist` artifacts.

---

## 1) What is and is not ported

### 1.1 Live gateway runtime paths (from `/etc/superego/*.toml`)

All sister superego configs currently point `ego.args` to `/opt/botster-brain-test/openclaw.mjs`:

- `/etc/superego/aeonbyte.toml`
- `/etc/superego/annie.toml`
- `/etc/superego/nira.toml`
- `/etc/superego/siofra.toml`

Each has:
- `args = ["/opt/botster-brain-test/openclaw.mjs", "gateway", "run", "--bind", "lan"]`

### 1.2 Running process confirmation

Running gateway commands are all from `/opt/botster-brain-test/openclaw.mjs` for:
- aeonbyte
- annie
- nira
- siofra

### 1.3 Runtime directories

- `/opt/botster-brain-test`
  - origin: `https://github.com/BotstersDev/botster-brain.git`
  - HEAD: `ecf3021a1`

- `/opt/botster-ego-dev`
  - origin: `https://github.com/TheBotsters/botster-ego.git`
  - HEAD: `85377a281`
  - tag: `v2026.3.2`

### 1.4 Port status conclusion

- **Ported (prepared):** `botster-ego` code exists and is buildable in `/opt/botster-ego-dev`.
- **Not ported (live):** all sister gateways still run `botster-brain-test`.

---

## 2) Current actuator architecture (as implemented)

The live architecture is a 3-service pattern per sister:

1. `sister.service` (Superego + OpenClaw gateway)
2. `sister-actuator.service` (actuator account)
3. `sister-ego.service` (brain-mode sidecar)

Examples:
- `aeon.service`, `aeon-actuator.service`, `aeon-ego.service`
- `annie.service`, `annie-actuator.service`, `annie-ego.service`
- etc.

### 2.1 Superego path

For each sister:
- systemd unit executes `/usr/local/bin/superego --config /etc/superego/<sister>.toml`
- superego config includes broker URL and local proxy listener (127.0.0.1:1980x)
- superego launches OpenClaw gateway process as sister user

### 2.2 Key env wiring in superego toml

Per sister toml (live):
- `SEKS_BROKER_URL = "http://127.0.0.1:1980x"`
- `BOTSTER_EXEC_VIA_SPINE = "1"`
- `HOME = "/home/<sister>"`

This indicates OpenClaw talks to local superego proxy for broker-mediated execution path.

### 2.3 Actuator services

`*-actuator.service` runs:
- user: `<sister>_actuator`
- command: `/usr/bin/node /opt/botster-actuator/dist/index.js --id ... --cwd /home/<sister>_actuator`
- env includes `SEKS_BROKER_URL=https://broker-internal.seksbot.com` and actuator token

`*-ego.service` runs brain-mode sidecar with:
- user: `<sister>`
- command: `/usr/bin/node /opt/botster-actuator/dist/index.js --id ... --cwd /home/<sister> --brain --webhook-port ...`
- env includes broker URL/token

---

## 3) Evidence of spine interception in botster-brain vs botster-ego

### 3.1 In `/opt/botster-brain-test` (present)

Grepping built dist shows explicit references:
- `src/seks/spine-client.ts`
- `src/seks/spine-exec-intercept.ts`
- `createSpineExecTool`, `createSpineProcessTool`, `createSpineReadTool`, `createSpineWriteTool`, `createSpineEditTool`
- `SEKS_BROKER_URL`

This is strong evidence that `botster-brain-test` runtime includes spine interception logic for core tools.

### 3.2 In `/opt/botster-ego-dev` (absent by grep)

Equivalent grep over built `dist` for:
- `BOTSTER_EXEC_VIA_SPINE`
- `spine-client`
- `spine-exec-intercept`
- `SEKS_BROKER_URL`

returned no matches.

### 3.3 Interpretation

At minimum, there is a major implementation mismatch between the two runtimes regarding SEKS spine interception visibility.

Given behavior observed during attempted cutover, this is consistent with actuator/routing incompatibility risk in current `botster-ego` branch/state.

---

## 4) Why behavior likely changed during cutover attempts

When Aeon was switched to `/opt/botster-ego-dev`, you observed identity/context differences and integration symptoms (e.g., path/user assumptions and tool behavior drift).

Given sections (2) and (3), the likely cause is not a single bad setting, but a runtime model mismatch:
- `botster-brain-test` appears tailored for spine-mediated routing in this deployment.
- `botster-ego v2026.3.2` appears to lack those same compiled interception markers.

---

## 5) Current known-good baseline

Known-good operational baseline today:
- all sisters on `/opt/botster-brain-test`
- superego + actuator + ego sidecar services active
- existing broker routing behavior intact

---

## 6) Recommended next steps (no changes performed by this report)

1. Treat `botster-ego` as **not actuator-compatible by default** until proven.
2. Create explicit compatibility checklist before any future cutover:
   - spine interception parity
   - broker URL/token/env assumptions
   - tool routing (exec/process/read/write/edit) end-to-end tests
3. Port missing SEKS spine integration into `botster-ego` (or verify equivalent mechanism exists) before reattempting sister migration.
4. Keep sister migrations one-at-a-time with hard rollback anchors.

---

## Appendix A — Service pattern snapshot

Running and enabled for each sister:
- `<sister>.service` (superego + openclaw)
- `<sister>-actuator.service` (actuator account)
- `<sister>-ego.service` (brain-mode sidecar)

Siofra currently has no active `siofra-ego.service` in the running snapshot shown, but unit exists and is configured.

---

## Appendix B — Data sources used

- `systemctl list-units --type=service --state=running`
- `systemctl cat <sister>.service`, `<sister>-actuator.service`, `<sister>-ego.service`
- `/etc/superego/*.toml`
- `git -C /opt/botster-brain-test ...`
- `git -C /opt/botster-ego-dev ...`
- process list for `openclaw.mjs gateway run`
- grep of built `dist` for spine/SEKS markers

---

## Appendix C — Source-level trace of routing differences (exact code paths)

This appendix answers: "Can we trace exact routing differences by code inspection?"  
Yes. The key deltas are identifiable in source.

### C.1 Botster-brain has explicit SEKS spine interception modules

In `/opt/botster-brain-test` source:

- `src/seks/spine-client.ts`
  - Reads `SEKS_BROKER_URL` from env
  - Defines broker-backed `spineExec(...)`
- `src/seks/spine-exec-intercept.ts`
  - Defines wrappers:
    - `createSpineExecTool`
    - `createSpineProcessTool`
    - `createSpineReadTool`
    - `createSpineWriteTool`
    - `createSpineEditTool`
- `src/agents/pi-tools.ts`
  - Imports `getSpineConfig` + wrapper functions from `src/seks/*`
  - Constructs normal tools (`exec/process/read/write/edit`)
  - Conditionally replaces/wraps those tools when spine config is present:
    - maps `read/write/edit` via `baseWithSpine`
    - wraps `exec/process` via `createSpineExecTool` / `createSpineProcessTool`

Concrete indicator lines (from grep):
- `src/agents/pi-tools.ts` references `getSpineConfig` and all `createSpine*` wrappers
- `src/seks/spine-client.ts` references `SEKS_BROKER_URL`

### C.2 Botster-ego source lacks equivalent spine modules/hooks

In `/opt/botster-ego-dev` (`TheBotsters/botster-ego @ v2026.3.2`) source:

- No `src/seks/` directory with `spine-client` / `spine-exec-intercept`
- No references to:
  - `getSpineConfig`
  - `createSpineExecTool` / `createSpineProcessTool` / etc.
  - `BOTSTER_EXEC_VIA_SPINE`
  - `SEKS_BROKER_URL`
- `src/agents/pi-tools.ts` exists, but grep shows no spine interception wiring analogous to brain fork.

### C.3 Exact routing consequence

Because brain fork wraps core tools through spine when configured, tool execution path can be broker/proxy-mediated before reaching actuator execution chain.

Because ego fork (current inspected source) lacks those explicit hook points, the same spine interception behavior is not guaranteed (and in practice appears absent in the tested build).

### C.4 Why this matters for your deployment

Your live superego TOMLs set:
- `SEKS_BROKER_URL=http://127.0.0.1:1980x`
- `BOTSTER_EXEC_VIA_SPINE=1`

That env contract aligns with brain fork code paths described above. Without corresponding code in ego fork, those env vars alone do not recreate routing behavior.

### C.5 Minimum parity requirements inferred from trace

To port actuator routing parity into `botster-ego`, the following must exist (or equivalent):

1. Spine client abstraction reading broker/proxy endpoint from env
2. Tool interception wrappers for `exec/process/read/write/edit`
3. Hook point in tool assembly (`pi-tools` equivalent) that conditionally applies wrappers
4. Error/status mapping compatible with current operational expectations (`completed/failed/running/timeout` flow)

