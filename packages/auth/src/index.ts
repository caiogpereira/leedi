export { auth, getSession, hasSessionCookie } from './auth.js';
export type { Auth, Session } from './auth.js';
export { registerUser } from './use-cases/register-user.js';
export type { RegisterInput, RegisterResult } from './use-cases/register-user.js';
export { loginUser } from './use-cases/login-user.js';
export type { LoginResult } from './use-cases/login-user.js';
export { logoutUser } from './use-cases/logout-user.js';
export { requestPasswordReset } from './use-cases/request-password-reset.js';
export { resetPassword } from './use-cases/reset-password.js';
export type { ResetPasswordResult } from './use-cases/reset-password.js';
export { passwordSchema } from './schemas/password.js';
export {
  hasPermission,
  getRequiredRoles,
  ROLE_PERMISSIONS,
  ROUTE_PERMISSION_MAP,
} from './rbac.js';
export type { TenantRole, WorkspaceRole, Permission } from './rbac.js';
export { getWorkspaceAdmin, getWorkspaceAdminRole } from './workspace-guard.js';
export type { WorkspaceAdmin } from './workspace-guard.js';
export { startImpersonation } from './use-cases/start-impersonation.js';
export type { StartImpersonationResult } from './use-cases/start-impersonation.js';
export { stopImpersonation } from './use-cases/stop-impersonation.js';
export type { StopImpersonationResult } from './use-cases/stop-impersonation.js';
