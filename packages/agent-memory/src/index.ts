// Public surface of @leedi/agent-memory — the ONLY access point to the
// agent_threads / agent_messages / agent_tool_calls tables (Architecture §6.5).
// No other module imports those schemas; everything goes through these functions.

export { saveThread, closeStaleThreads } from './use-cases/save-thread.js';
export type { SaveThreadInput } from './use-cases/save-thread.js';

export { saveMessage } from './use-cases/save-message.js';
export type { SaveMessageInput } from './use-cases/save-message.js';

export { getThreadHistory } from './use-cases/get-thread-history.js';

export { updateThreadStatus } from './use-cases/update-thread-status.js';

export { saveToolCall } from './use-cases/save-tool-call.js';
export type { SaveToolCallInput } from './use-cases/save-tool-call.js';

export {
  pauseThreadByWindowId,
  resumeThreadByWindowId,
  closeThreadByWindowId,
} from './use-cases/manage-thread-by-window.js';

export type {
  AgentThread,
  AgentMessage,
  AgentMessageRole,
  AgentMessageContent,
  AgentThreadStatus,
  AnthropicHistoryMessage,
} from './types.js';
