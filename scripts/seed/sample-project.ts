#!/usr/bin/env -S npx tsx
/**
 * Sample project seed (Phase 4 — Dev D + Integration).
 *
 * Creates a demo Project from `samples/projects/demo-project.json` via the
 * Projects API. If no token is provided, obtains one by logging in (or
 * registering) the durable demo user.
 *
 * Usage:
 *   pnpm --filter api exec tsx ../../scripts/seed/sample-project.ts
 *   CREATORAI_TOKEN=<jwt> pnpm --filter api exec tsx ../../scripts/seed/sample-project.ts
 *   pnpm --filter api exec tsx ../../scripts/seed/sample-project.ts --token <jwt>
 *   pnpm --filter api exec tsx ../../scripts/seed/sample-project.ts --dry-run
 *
 * Env:
 *   API_BASE_URL      default http://localhost:4000/api/v1
 *   CREATORAI_TOKEN   Bearer JWT (optional if demo user can register/login)
 *   DEMO_EMAIL        default demo@creatorai.local
 *   DEMO_PASSWORD     default password123
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

type AuthTokenResponse = {
  token: string;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = resolve(ROOT, 'samples/projects/demo-project.json');
const DEFAULT_API = 'http://localhost:4000/api/v1';
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@creatorai.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'password123';
const DEMO_NAME = 'Demo User';

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

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON from ${res.url}, got: ${text.slice(0, 200)}`);
  }
}

/** Login, or register-then-login, for the durable demo user. */
async function obtainDemoToken(apiBase: string): Promise<string> {
  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
  });

  if (loginRes.ok) {
    const data = await parseJson<AuthTokenResponse>(loginRes);
    console.log(`Auth: logged in as ${DEMO_EMAIL}`);
    return data.token;
  }

  const registerRes = await fetch(`${apiBase}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      name: DEMO_NAME,
    }),
  });

  if (!registerRes.ok) {
    const body = await registerRes.text();
    throw new Error(
      `Could not login or register demo user ${DEMO_EMAIL}: login=${loginRes.status}, register=${registerRes.status} ${body}`,
    );
  }

  const data = await parseJson<AuthTokenResponse>(registerRes);
  console.log(`Auth: registered demo user ${DEMO_EMAIL}`);
  return data.token;
}

async function main(): Promise<void> {
  const { token: argToken, dryRun } = parseArgs(process.argv.slice(2));
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

  const token = argToken ?? (await obtainDemoToken(apiBase));

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
