// Shared types for @leedi/agent-memory. This package is the SOLE owner of the
// agent_threads / agent_messages / agent_tool_calls tables (Architecture §6.5).
// No other module imports those schemas directly — they go through this barrel.

/** Anthropic SDK message roles persisted in agent_messages. */
export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/** Thread lifecycle status. */
export type AgentThreadStatus = 'ativo' | 'pausado' | 'encerrado';

/**
 * Anthropic message `content` — either a plain string (simple text turn) or the
 * SDK's structured content-block array (text / tool_use / tool_result blocks).
 * Stored verbatim in agent_messages.content (jsonb).
 */
export type AgentMessageContent = string | unknown[];

export interface AgentThread {
  id: string;
  tenantId: string;
  leadId: string | null;
  conversationWindowId: string | null;
  status: AgentThreadStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentMessage {
  id: string;
  threadId: string;
  role: AgentMessageRole;
  content: AgentMessageContent;
  createdAt: Date;
}

/** One entry shaped for the Anthropic `messages` array (user/assistant only). */
export interface AnthropicHistoryMessage {
  role: 'user' | 'assistant';
  content: AgentMessageContent;
}
