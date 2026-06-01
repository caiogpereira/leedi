export { listLeads } from './use-cases/list-leads.js';
export type {
  ListLeadsInput,
  ListLeadsResult,
  LeadRow,
  LeadTemperatura,
  LeadStatus,
} from './use-cases/list-leads.js';

export { getLeadDetail } from './use-cases/get-lead-detail.js';
export type {
  GetLeadDetailInput,
  LeadDetail,
  LeadDetailTag,
  LeadDetailJourneyEvent,
} from './use-cases/get-lead-detail.js';

export { importLeadsCsv } from './use-cases/import-leads-csv.js';
export type {
  ImportLeadsCsvInput,
  ImportLeadsCsvResult,
  ImportLeadsCsvRow,
} from './use-cases/import-leads-csv.js';

export { isUuid } from './use-cases/is-uuid.js';

export { addLeadTag } from './use-cases/add-lead-tag.js';
export type { AddLeadTagInput, AddLeadTagResult } from './use-cases/add-lead-tag.js';

export { removeLeadTag } from './use-cases/remove-lead-tag.js';
export type { RemoveLeadTagInput } from './use-cases/remove-lead-tag.js';

export { updateLeadStatus } from './use-cases/update-lead-status.js';
export type {
  UpdateLeadStatusInput,
  LeadStatusChange,
} from './use-cases/update-lead-status.js';

export { listDispatchTargets } from './use-cases/list-dispatch-targets.js';
export type {
  ListDispatchTargetsInput,
  DispatchTarget,
} from './use-cases/list-dispatch-targets.js';

export { findOrCreateLeadByPhone } from './use-cases/find-or-create-lead-by-phone.js';
export type {
  FindOrCreateLeadByPhoneInput,
  FindOrCreateLeadByPhoneResult,
} from './use-cases/find-or-create-lead-by-phone.js';
