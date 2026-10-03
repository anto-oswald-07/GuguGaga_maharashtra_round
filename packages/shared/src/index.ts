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
  type ProjectStage,
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
