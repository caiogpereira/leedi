// Public surface of @leedi/agent — only import from this file.

export {
  SALES_MODELS,
  MODEL_PRICING,
  TASK_MODELS,
  modelIdForTask,
} from './config/model-routing.js';
export type { ModelBucket, AiTask } from './config/model-routing.js';

export { buildSystemPrompt, BLOCK_MARKERS } from './utils/build-system-prompt.js';
export type {
  AgentConfigInput,
  SalesMethodInput,
  ActiveProductInput,
  EstiloMensagem,
} from './utils/build-system-prompt.js';

export {
  resolveEnabledTools,
  CONFIGURABLE_TOOLS,
  ALWAYS_ON_TOOLS,
} from './utils/resolve-enabled-tools.js';
export type {
  ConfigurableTool,
  AlwaysOnTool,
  ToolName,
  ToolsHabilitadas,
} from './utils/resolve-enabled-tools.js';

export { splitResponse } from './utils/split-response.js';

export { buildToolList, routeToolCall } from './tools/registry.js';
export type { ToolContext, ToolDefinition, CampaignPhase } from './tools/types.js';

export { buscarHistoricoLead } from './tools/buscar-historico-lead.js';
export type { LeadHistoryResult, LeadJourneyEvent } from './tools/buscar-historico-lead.js';
export { verificarElegibilidade } from './tools/verificar-eligibilidade.js';
export type {
  EligibilityResult,
  EligibilityReason,
  VerificarElegibilidadeInput,
} from './tools/verificar-eligibilidade.js';
export { consultarOfertasAtivas } from './tools/consultar-ofertas-ativas.js';
export type {
  EffectiveProduto,
  ActiveCampaignContext,
  OfertasAtivasResult,
  CampaignTipo,
  CampaignFase,
} from './tools/consultar-ofertas-ativas.js';
export { consultarBaseConhecimento } from './tools/consultar-base-conhecimento.js';
export type {
  ConsultarBaseConhecimentoInput,
  ConsultarBaseConhecimentoResult,
  KnowledgeEntry,
} from './tools/consultar-base-conhecimento.js';

export { processMessage } from './use-cases/process-message.js';
export type {
  ProcessMessageInput,
  ProcessMessageResult,
  ProcessMessageDeps,
  RedisLock,
  WhatsAppSender,
  MediaProvider,
  ToolCallLog,
} from './use-cases/process-message.js';

export { transcribeAudio, getTranscriptionProvider } from './utils/transcribe-audio.js';
export type { TranscriptionProvider } from './ports/transcription-provider.js';
