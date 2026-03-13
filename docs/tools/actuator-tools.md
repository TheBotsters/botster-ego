# Brain-Level Actuator Tools (`actuator_list`, `actuator_select`)

These tools let an agent inspect and switch its active execution environment ("actuator") at runtime.

## What the tools do

### `actuator_list`
Returns all actuators visible to the current agent, including:
- `id`
- `name`
- `type`
- `status`
- selected marker (`← selected`)

Use this first when you need to confirm where commands will run.

### `actuator_select`
Switches the active actuator for subsequent tool calls.

Input:
- `actuator_id` (required, non-empty string)

After selecting, the tool verifies the new selection by calling `actuator/selected` and reports the selected actuator name/type/status.

---

## Security model (critical)

The brain (ego) **must not** call the broker directly with long-lived broker credentials.

Instead:
1. Brain tools call `SEKS_BROKER_URL`
2. In Freudian deployments, `SEKS_BROKER_URL` points to the **superego proxy** (for example `http://127.0.0.1:19803`)
3. Superego injects broker auth and enforces endpoint allowlists

This preserves the boundary: ego has operational capability but does not hold broker control-plane secrets.

---

## Runtime behavior

Selection affects brain-routed execution tools:
- `exec`
- `process`
- `read`
- `write`
- `edit`

Operational rule: once `actuator_select` succeeds, subsequent routed commands target that actuator until selection changes again.

### Expected failure modes
- **No actuator available/selected**: command routing returns no target
- **Invalid actuator ID**: select request fails with broker/superego error
- **Offline actuator**: command dispatch fails or times out
- **Superego allowlist missing endpoint**: 403/blocked at proxy

---

## Operator quick checks

### Check current selection
```bash
curl -sS http://127.0.0.1:19803/v1/actuator/selected \
  -H "Authorization: Bearer $SUPEREGO_BROKER_TOKEN"
```

### List available actuators
```bash
curl -sS http://127.0.0.1:19803/v1/actuators \
  -H "Authorization: Bearer $SUPEREGO_BROKER_TOKEN"
```

### Switch actuator
```bash
curl -sS -X POST http://127.0.0.1:19803/v1/actuator/select \
  -H "Authorization: Bearer $SUPEREGO_BROKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"actuator_id":"<ACTUATOR_ID>"}'
```

---

## Implementation pointers

- Tool registration: `src/agents/pi-tools.ts`
- Tool wrappers: `src/seks/spine-exec-intercept.ts`
- API client calls: `src/seks/spine-client.ts`

These tools are enabled when spine/superego routing is configured.
