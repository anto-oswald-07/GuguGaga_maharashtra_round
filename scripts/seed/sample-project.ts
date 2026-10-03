#!/usr/bin/env -S npx tsx
/**
 * Sample project seed outline (Phase 4 — Dev D).
 *
 * Creates a demo Project from `samples/projects/demo-project.json` via the
 * Projects API. May be incomplete until Integration supplies a stable auth
 * token / demo user — see TODO markers below.
 *
 * Usage:
 *   CREATORAI_TOKEN=<jwt> npx tsx scripts/seed/sample-project.ts
 *   npx tsx scripts/seed/sample-project.ts --token <jwt>
 *   npx tsx scripts/seed/sample-project.ts --dry-run
 *
 * Env:
 *   API_BASE_URL   default http://localhost:4000/api/v1
 *   CREATORAI_TOKEN  Bearer JWT (userId + workspaceId claims)
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type DemoFixture = {
  schemaVersion: string;
  slug: string;
  title: string;
  description: string;
  initialStage: string;
  targetPlatforms: string[];
  sampleScript: { path: string; topic: string; audience: string; tone: string };
  sampleMedia: {
    dummyVideoScript: string;
    dummyVideoPath: string;
    notes: string;
  };
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = resolve(ROOT, 'samples/projects/demo-project.json');
const DEFAULT_API = 'http://localhost:4000/api/v1';

function parseArgs(argv: string[]): { token?: string; dryRun: boolean } {
  let token = process.env.CREATORAI_TOKEN;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--token') {
      token = argv[i + 1];
      i += 1;
    }
  }
  return { token, dryRun };
}

async function loadFixture(): Promise<DemoFixture> {
  const raw = await readFile(FIXTURE_PATH, 'utf8');
  return JSON.parse(raw) as DemoFixture;
}

async function main(): Promise<void> {
  const { token, dryRun } = parseArgs(process.argv.slice(2));
  const apiBase = (process.env.API_BASE_URL ?? DEFAULT_API).replace(/\/$/, '');
  const fixture = await loadFixture();

  const body = {
    title: fixture.title,
    description: fixture.description,
    targetPlatforms: fixture.targetPlatforms,
  };

  console.log('Demo fixture:', FIXTURE_PATH);
  console.log('  slug:           ', fixture.slug);
  console.log('  title:          ', body.title);
  console.log('  platforms:      ', body.targetPlatforms.join(', '));
  console.log('  sample script:  ', fixture.sampleScript.path);
  console.log('  dummy media:    ', fixture.sampleMedia.dummyVideoPath);
  console.log('  initial stage:  ', fixture.initialStage, '(API default)');
  console.log('  API:            ', `${apiBase}/projects`);

  if (dryRun) {
    console.log('\n--dry-run: would POST:');
    console.log(JSON.stringify(body, null, 2));
    process.exit(0);
  }

  // TODO_INTEGRATION: wire a durable demo user + token (register/login once,
  // or seed User/Workspace via Prisma). Until then, require CREATORAI_TOKEN.
  if (!token) {
    console.error(`
ERROR: missing auth token.
  1. Start API:  pnpm --filter api dev
  2. Register/login to obtain a JWT
  3. Re-run:     CREATORAI_TOKEN=<jwt> npx tsx scripts/seed/sample-project.ts

Or inspect the payload only:
  npx tsx scripts/seed/sample-project.ts --dry-run
`);
    process.exit(1);
  }

  const res = await fetch(`${apiBase}/projects`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep raw text */
  }

  if (!res.ok) {
    console.error('Seed failed:', res.status, json);
    process.exit(1);
  }

  console.log('\nCreated project:');
  console.log(JSON.stringify(json, null, 2));
  console.log(`
Next (manual / later phases):
  - Attach footage: POST /projects/:id/assets  (upload dummy.mp4 first)
  - Walk stages per docs/demo/golden-path-prep.md
  - Load script text from ${fixture.sampleScript.path} in Script tab (Phase 5)
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
