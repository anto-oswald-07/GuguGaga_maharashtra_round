export { API_PREFIX } from './constants';
export {
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
  loginRequestSchema,
  publicUserSchema,
  workspaceSchema,
  authTokenResponseSchema,
  meResponseSchema,
  type RegisterRequest,
  type LoginRequest,
  type PublicUser,
  type WorkspaceDto,
  type AuthTokenResponse,
  type MeResponse,
  type JwtPayload,
} from './auth';
export {
  MIN_PASSWORD_LENGTH,
  isPasswordAcceptable,
  checkPasswordStrength,
} from './validation/password';
export type { PasswordStrengthResult } from './validation/password';
export {
  assetTypeSchema,
  ASSET_TYPES,
  assetSchema,
  assetListQuerySchema,
  updateAssetRequestSchema,
  assetListResponseSchema,
  type AssetType,
  type AssetDto,
  type AssetListQuery,
  type UpdateAssetRequest,
  type AssetListResponse,
} from './assets';
export type {
  VideoAssetMetadata,
  ExtractedAssetMetadata,
} from './types/assetMetadata';
export {
  projectStageSchema,
  DEFAULT_STAGE_ORDER,
  defaultStageOrder,
  stageIndex,
  isTerminalStage,
  isProjectStage,
  type ProjectStage,
} from './workflow';
export {
  PROJECT_STAGES,
  platformSchema,
  PLATFORMS,
  projectSchema,
  createProjectRequestSchema,
  updateProjectRequestSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  transitionStageRequestSchema,
  attachAssetsRequestSchema,
  detachAssetsRequestSchema,
  stageEventSchema,
  stageHistoryResponseSchema,
  type Platform,
  type ProjectDto,
  type CreateProjectRequest,
  type UpdateProjectRequest,
  type ProjectListQuery,
  type ProjectListResponse,
  type TransitionStageRequest,
  type AttachAssetsRequest,
  type DetachAssetsRequest,
  type StageEventDto,
  type StageHistoryResponse,
} from './projects';
export {
  scriptGenInputSchema,
  generatedScriptMetaSchema,
  generatedScriptSchema,
  scriptGenResultSchema,
  generatedHooksSchema,
  supportingContentSchema,
  assertGeneratedScript,
  assertGeneratedHooks,
  assertSupportingContent,
  type ScriptGenInput,
  type GeneratedScriptMeta,
  type GeneratedScript,
  type ScriptGenResult,
  type GeneratedHooks,
  type SupportingContent,
} from './schemas/scriptSchema';
export {
  scriptSourceSchema,
  SCRIPT_SOURCES,
  scriptContentSchema,
  scriptVersionSchema,
  scriptDocumentSchema,
  scriptDocumentDetailSchema,
  scriptListResponseSchema,
  createScriptRequestSchema,
  createScriptVersionRequestSchema,
  generateScriptRequestSchema,
  generateHooksRequestSchema,
  generateSupportingRequestSchema,
  refineScriptRequestSchema,
  enqueueJobResponseSchema,
  type ScriptSource,
  type ScriptContent,
  type ScriptVersionDto,
  type ScriptDocumentDto,
  type ScriptDocumentDetailDto,
  type ScriptListResponse,
  type CreateScriptRequest,
  type CreateScriptVersionRequest,
  type GenerateScriptRequest,
  type GenerateHooksRequest,
  type GenerateSupportingRequest,
  type RefineScriptRequest,
  type EnqueueJobResponse,
} from './scripts';
export {
  jobTypeSchema,
  JOB_TYPES,
  jobStatusSchema,
  JOB_STATUSES,
  jobSchema,
  jobListQuerySchema,
  jobListResponseSchema,
  mockCompleteJobRequestSchema,
  type JobType,
  type JobStatus,
  type JobDto,
  type JobListQuery,
  type JobListResponse,
  type MockCompleteJobRequest,
} from './jobs';
export {
  LOW_CONFIDENCE_THRESHOLD,
  transcriptSegmentSchema,
  transcriptSchema,
  transcriptDetailSchema,
  transcriptListResponseSchema,
  scriptFootageMapSchema,
  mappingListResponseSchema,
  transcribeRequestSchema,
  alignScriptRequestSchema,
  patchMappingRequestSchema,
  type TranscriptSegmentDto,
  type TranscriptDto,
  type TranscriptDetailDto,
  type TranscriptListResponse,
  type ScriptFootageMapDto,
  type MappingListResponse,
  type TranscribeRequest,
  type AlignScriptRequest,
  type PatchMappingRequest,
} from './mapping';
export {
  clipCandidateStatusSchema,
  CLIP_CANDIDATE_STATUSES,
  clipCandidateSchema,
  clipCandidateListResponseSchema,
  proposeClipsRequestSchema,
  patchClipCandidateRequestSchema,
  type ClipCandidateStatus,
  type ClipCandidateDto,
  type ClipCandidateListResponse,
  type ProposeClipsRequest,
  type PatchClipCandidateRequest,
} from './clips';

/** Response shape for `GET /api/v1/health`. */
export type HealthResponse = {
  status: 'ok';
  service: 'api';
};

/** Standard API error payload. */
export type ApiError = {
  error: string;
  message: string;
  statusCode: number;
};
