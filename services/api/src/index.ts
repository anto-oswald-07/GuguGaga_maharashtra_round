import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import {
  API_PREFIX,
  type HealthResponse,
} from '@creatorai/shared';
import { registerAuthRoutes } from './modules/auth/routes';
import { registerAssetRoutes } from './modules/assets/routes';

loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

/** Max upload size (100 MiB) for Phase 3 assets. */
const MAX_FILE_BYTES = 100 * 1024 * 1024;

async function main() {
  const app = Fastify({ logger: true });

  // Web (Next) runs on a different origin (e.g. :3000 / :3002) than the API (:4000).
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  });

  app.get(`${API_PREFIX}/health`, async (): Promise<HealthResponse> => {
    return { status: 'ok', service: 'api' };
  });

  await registerAuthRoutes(app);
  await registerAssetRoutes(app);

  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}${API_PREFIX}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
