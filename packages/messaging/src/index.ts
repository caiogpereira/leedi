export { recordInboundMessage } from './use-cases/record-inbound-message.js';
export type { RecordInboundMessageInput } from './use-cases/record-inbound-message.js';
export { recordOutboundMessage } from './use-cases/record-outbound-message.js';
export type {
  RecordOutboundMessageInput,
  OutboundMessageRecord,
} from './use-cases/record-outbound-message.js';

export { resolveConversationWindow } from './use-cases/resolve-conversation-window.js';
export type {
  ResolveConversationWindowInput,
  ConversationWindowResult,
} from './use-cases/resolve-conversation-window.js';

export { saveMessage } from './use-cases/save-message.js';
export type {
  SaveMessageInput,
  MessageDirection,
  MessageAutor,
  MessageTipo,
  MessageStatus,
} from './use-cases/save-message.js';

/**
 * Structured JSON stored in inbox_assignments.resumo_handoff by the transferir_humano tool.
 * UI must JSON.parse this field and fall back to raw text on parse error (forward-compatible).
 */
export interface HandoffSummary {
  quem_e: string;
  o_que_quer: string;
  objecoes: string[];
  temperatura: 'frio' | 'morno' | 'quente';
  motivo: string;
  resposta_sugerida: string;
}
