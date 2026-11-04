export { deploymentModes, isDeploymentMode, type DeploymentMode } from "./deployment-mode";
export {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "./errors";
export { fail, ok, type ApiEnvelope, type ApiFailure, type ApiSuccess } from "./envelope";
export {
  assertPermission,
  isPermission,
  isRole,
  permissions,
  permissionsForRole,
  roleHasPermission,
  roles,
  type Permission,
  type Role,
} from "./rbac";
export {
  assertLeadTransition,
  canTransitionLead,
  leadStatuses,
  type LeadStatus,
} from "./lead-state";
export { isEnabled, type FlagContext } from "./flags";
export {
  decryptSecret,
  encryptSecret,
  importMasterKey,
  type EncryptedBlob,
} from "./crypto";
export {
  buildAuthorizationUrl,
  createPkcePair,
  oauthStateSchema,
  type OAuthState,
} from "./oauth";
export {
  assertEventEnvelope,
  eventEnvelopeSchema,
  relayReady,
  type EventEnvelope,
  type OutboxRecord,
} from "./outbox";
export { formatLogLine, redactPii, type LogFields } from "./telemetry";
export {
  deriveDataHealth,
  planSyncJobs,
  syncJobSchema,
  type DataHealth,
  type DataHealthStatus,
  type SyncJob,
} from "./scheduler";
export {
  InMemoryEmailSender,
  type EmailMessage,
  type EmailSender,
} from "./email";


