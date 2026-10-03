import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import Fastify from 'fastify';
import {
  API_PREFIX,
  type HealthResponse,
} from '@creatorai/shared';
import { registerAuthRoutes } from './modules/auth/routes';

loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

async function main() {
  const app = Fastify({ logger: true });

  app.get(`${API_PREFIX}/health`, async (): Promise<HealthResponse> => {
    return { status: 'ok', service: 'api' };
  });

  await registerAuthRoutes(app);

  await app.listen({ port, host });
  app.log.info(`API listening on http://${host}:${port}${API_PREFIX}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
