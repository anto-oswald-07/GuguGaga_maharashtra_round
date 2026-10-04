import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import {
  API_PREFIX,
  type HealthResponse,
} from '@creatorai/shared';
import { prisma } from './db/prisma';
import { registerAuthRoutes } from './modules/auth/routes';
import { registerAssetRoutes } from './modules/assets/routes';
import { registerProjectRoutes } from './modules/projects/routes';
import { registerScriptRoutes } from './modules/scripts/routes';
import { registerJobRoutes } from './modules/jobs/routes';
import { registerMappingRoutes } from './modules/mapping/routes';
import { registerClipsRoutes } from './modules/clips/routes';
import { registerTimelinesRoutes } from './modules/timelines/routes';
import { registerPacksRoutes } from './modules/packs/routes';
import { registerInsightsRoutes } from './modules/insights/routes';
import { registerSceneRoutes } from './modules/scenes/routes';
import { startJobPoller } from './modules/jobs/processor';

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
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
  });

  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  });

  app.get(`${API_PREFIX}/health`, async (_request, reply) => {
    const checkedAt = new Date().toISOString();
    try {
      await prisma.$queryRaw`SELECT 1`;
      const body: HealthResponse = {
        status: 'ok',
        service: 'api',
        db: 'up',
        checkedAt,
      };
      return reply.status(200).send(body);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Database unreachable';
      app.log.error({ err }, 'Health check DB failed');
      const body: HealthResponse = {
        status: 'degraded',
        service: 'api',
        db: 'down',
        checkedAt,
      };
      return reply.status(503).send({
        ...body,
        error: 'db_unavailable',
        message: `API is up but Postgres is unreachable: ${message}`,
        statusCode: 503,
      });
    }
  });

  await registerAuthRoutes(app);
  await registerAssetRoutes(app);
  await registerProjectRoutes(app);
  await registerScriptRoutes(app);
  await registerMappingRoutes(app);
  await registerSceneRoutes(app);
  await registerClipsRoutes(app);
  await registerTimelinesRoutes(app);
  await registerPacksRoutes(app);
  await registerInsightsRoutes(app);
  await registerJobRoutes(app);

  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}${API_PREFIX}`);
  startJobPoller();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
