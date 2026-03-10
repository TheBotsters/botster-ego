# Actuator Compatibility Specification for `botster-ego`
Date: 2026-03-10
Author: FootGun
Companion doc: `botster-ego-port-status-and-actuator-routing-report-2026-03-10.md`

---

## Purpose

This document defines the compatibility requirements `TheBotsters/botster-ego` must satisfy to match the currently working actuator-integrated behavior used in production (`BotstersDev/botster-brain @ ecf3021a1`).

It is a technical specification/reference, not an execution runbook.

---

## Context

Current production routing behavior relies on:
- superego-managed OpenClaw gateway process per sister
- local superego proxy endpoint passed via env (`SEKS_BROKER_URL`)
- SEKS spine interception of core tools in the brain runtime

Source-level trace from baseline runtime shows explicit modules and hook points for this path:
- `src/seks/spine-client.ts`
- `src/seks/spine-exec-intercept.ts`
- `src/agents/pi-tools.ts` (conditional tool wrapping)

---

## Compatibility Requirements

### R1 — Spine client capability
`botster-ego` must provide a broker/spine client layer that can:
- read broker/proxy endpoint from runtime env (e.g., `SEKS_BROKER_URL`)
- submit command payloads to broker/spine
- parse normalized response status set (`completed`, `failed`, `running`, `timeout`)
- return structured errors for malformed payloads/status

### R2 — Core tool interception parity
`botster-ego` must support interception wrappers for these tools:
- `exec`
- `process`
- `read`
- `write`
- `edit`

Wrapper behavior must preserve call/response semantics expected by existing agent tooling.

### R3 — Tool assembly hook parity
Tool construction layer (currently analogous to `src/agents/pi-tools.ts`) must:
- resolve whether spine routing is enabled
- wrap `read/write/edit` tool instances in routed mode
- wrap `exec/process` tool instances in routed mode
- leave default local behavior unchanged when routed mode is disabled

### R4 — Environment contract compatibility
`botster-ego` must behave consistently with current deployment env contract, including:
- `SEKS_BROKER_URL`
- `BOTSTER_EXEC_VIA_SPINE`

If env names are changed, backward-compatible aliases/documented migration mapping are required.

### R5 — Service topology compatibility
Runtime behavior must remain compatible with existing sister service topology:
- `<sister>.service` (superego + gateway)
- `<sister>-actuator.service`
- `<sister>-ego.service`

No implicit assumptions should require moving sister home/config roots to actuator user context.

### R6 — Error mapping and observability
Routed mode must provide:
- deterministic error mapping for broker/spine failures
- explicit startup diagnostics indicating whether routed mode is active and why
- enough logs to distinguish local tool execution vs routed tool execution

### R7 — Non-regression in non-routed mode
When routed mode is off/unavailable:
- core tools must still function under local execution semantics
- no hard dependency on actuator routing should break baseline OpenClaw operation

---

## Reference Delta (as of 2026-03-10)

Observed in baseline `botster-brain` source:
- explicit `src/seks/*` modules and `createSpine*` hooks wired into tool assembly

Observed in tested `botster-ego v2026.3.2` source (grep-based trace):
- no equivalent `src/seks/spine-*` modules
- no `getSpineConfig` / `createSpine*` references in tool assembly path
- no matching routed-mode env usage markers found in source search

This establishes a compatibility gap against requirements R1–R4.

---

## Validation Criteria (Definition of Compatible)

A `botster-ego` build is actuator-compatible when all are true:

1. Routed mode can be enabled via env contract in a superego-managed sister runtime.
2. Routed calls for `exec/process/read/write/edit` complete successfully through broker/spine path.
3. Response/error semantics remain compatible with existing agent/tool consumers.
4. Sister service identity/home assumptions remain stable (no unintended cross-user drift).
5. Disabling routed mode restores local execution behavior without regressions.

---

## Related Documents

- Port/routing status report:
  - `docs/botster-actuator-port/botster-ego-port-status-and-actuator-routing-report-2026-03-10.md`

- Operational rollout procedures (kept outside this repo doc set):
  - deployment runbooks and sister-by-sister migration checklists maintained in operations workspace
