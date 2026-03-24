# TODO — botster-ego fork

Items removed when resolved/merged.

## Windows CI temporarily disabled (2026-03-24)

- `checks-windows` in `.github/workflows/ci.yml` is set to `if: false`.
- Reason: unblock upstream-sync and BSA work while Windows-specific flakes are triaged.

### Re-enable conditions

1. `src/memory/manager.async-search.test.ts` Windows timeout is resolved upstream or isolated.
2. Spine-related tests are stable across Linux/macOS/Windows without environment-specific failures.
3. Labeler/permissions noise is documented separately (not a code blocker).
