/**
 * Plugin SDK subpath for the Zulip channel extension.
 * Re-exports everything the Zulip extension needs from upstream submodules.
 */

// Channel setup and account management
export {
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
} from "../channels/plugins/setup-helpers.js";
export {
  deleteAccountFromConfigSection,
  setAccountEnabledInConfigSection,
} from "../channels/plugins/config-helpers.js";
export { formatPairingApproveHint } from "../channels/plugins/helpers.js";
export { buildChannelConfigSchema } from "../channels/plugins/config-schema.js";
export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "../routing/session-key.js";

// Types
export type { ChannelPlugin } from "../channels/plugins/types.plugin.js";
export type { OpenClawConfig } from "../config/config.js";
export type { RuntimeEnv } from "../runtime.js";
export type { ChatType } from "../channels/chat-type.js";
export type { ReplyPayload } from "../auto-reply/types.js";

// Monitor utilities
export { createReplyPrefixOptions } from "../channels/reply-prefix.js";
export { createTypingCallbacks } from "../channels/typing.js";
export { logTypingFailure } from "../channels/logging.js";
