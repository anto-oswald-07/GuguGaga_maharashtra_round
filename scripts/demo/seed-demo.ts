#!/usr/bin/env -S npx tsx
/**
 * Phase 10 demo seed (Dev C / Arvin).
 *
 * Creates durable demo user + project + uploads/attaches dummy.mp4 +
 * loads samples/scripts/sample_script.md as a USER script.
 *
 * Usage:
 *   npx tsx scripts/demo/seed-demo.ts
 *   npx tsx scripts/demo/seed-demo.ts --dry-run
 *   npx tsx scripts/demo/seed-demo.ts --skip-upload
 *   npx tsx scripts/demo/seed-demo.ts --skip-script
 *
 * Env:
 *   API_BASE_URL      default http://localhost:4000/api/v1
 *   WEB_BASE_URL      default http://localhost:3002
 *   CREATORAI_TOKEN   optional Bearer JWT
 *   DEMO_EMAIL        default demo@creatorai.local
 *   DEMO_PASSWORD     default password123
 */

import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
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

type AuthTokenResponse = { token: string };
type ProjectDto = { id: string; title: string; stage?: string };
type AssetDto = { id: string; name?: string };
type ScriptDto = { id: string; title?: string | null };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_PATH = resolve(ROOT, 'samples/projects/demo-project.json');
const DEFAULT_API = 'http://localhost:4000/api/v1';
const DEFAULT_WEB = 'http://localhost:3002';
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@creatorai.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'password123';
const DEMO_NAME = 'Demo User';

type Args = {
  token?: string;
  dryRun: boolean;
  skipUpload: boolean;
  skipScript: boolean;
};

function parseArgs(argv: string[]): Args {
  let token = process.env.CREATORAI_TOKEN;
  let dryRun = false;
  let skipUpload = false;
  let skipScript = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--skip-upload') skipUpload = true;
    else if (arg === '--skip-script') skipScript = true;
    else if (arg === '--token') {
      token = argv[i + 1];
      i += 1;
    }
  }
  return { token, dryRun, skipUpload, skipScript };
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON from ${res.url}, got: ${text.slice(0, 200)}`);
  }
}

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

/** Parse samples/scripts/sample_script.md into hook/body/cta. */
export function parseSampleScriptMarkdown(md: string): {
  title: string;
  hook: string;
  body: string;
  cta: string;
  rawText: string;
} {
  const title =
    md.match(/^#\s+(.+)$/m)?.[1]?.replace(/^Sample Script —\s*/i, '').trim() ||
    'Batch Reels sample script';

  const section = (name: string): string => {
    const re = new RegExp(
      `##\\s*${name}\\s*\\r?\\n+([\\s\\S]*?)(?=\\r?\\n##\\s|$)`,
      'i',
    );
    return md.match(re)?.[1]?.trim() ?? '';
  };

  const hook = section('Hook');
  const body = section('Body');
  const cta = section('CTA');
  if (!hook || !body || !cta) {
    throw new Error(
      'sample_script.md missing ## Hook / ## Body / ## CTA sections',
    );
  }
  return { title, hook, body, cta, rawText: md };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiBase = (process.env.API_BASE_URL ?? DEFAULT_API).replace(/\/$/, '');
  const webBase = (process.env.WEB_BASE_URL ?? DEFAULT_WEB).replace(/\/$/, '');
  const fixture = JSON.parse(
    await readFile(FIXTURE_PATH, 'utf8'),
  ) as DemoFixture;
  const scriptPath = resolve(ROOT, fixture.sampleScript.path);
  const dummyPath = resolve(ROOT, fixture.sampleMedia.dummyVideoPath);
  const sampleMd = await readFile(scriptPath, 'utf8');
  const parsedScript = parseSampleScriptMarkdown(sampleMd);

  const projectBody = {
    title: fixture.title,
    description: fixture.description,
    targetPlatforms: fixture.targetPlatforms,
  };

  console.log('Phase 10 demo seed');
  console.log('  fixture:   ', FIXTURE_PATH);
  console.log('  project:   ', projectBody.title);
  console.log('  platforms: ', projectBody.targetPlatforms.join(', '));
  console.log('  script:    ', fixture.sampleScript.path);
  console.log('  media:     ', fixture.sampleMedia.dummyVideoPath);
  console.log('  API:       ', apiBase);
  console.log('  Web:       ', webBase);
  console.log('  user:      ', DEMO_EMAIL);

  if (args.dryRun) {
    console.log('\n--dry-run payload (project):');
    console.log(JSON.stringify(projectBody, null, 2));
    console.log('\n--dry-run script content keys:', {
      title: parsedScript.title,
      hookChars: parsedScript.hook.length,
      bodyChars: parsedScript.body.length,
      ctaChars: parsedScript.cta.length,
    });
    console.log('\nNext: drop --dry-run with API running.');
    process.exit(0);
  }

  if (!args.skipUpload && !(await fileExists(dummyPath))) {
    console.error(`
Missing demo footage: ${dummyPath}
Run: ./scripts/media/make-dummy-video.sh
Or re-run with --skip-upload
`);
    process.exit(1);
  }

  const token = args.token ?? (await obtainDemoToken(apiBase));
  const auth = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  const projRes = await fetch(`${apiBase}/projects`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify(projectBody),
  });
  if (!projRes.ok) {
    console.error('Create project failed:', projRes.status, await projRes.text());
    process.exit(1);
  }
  const project = await parseJson<ProjectDto>(projRes);
  console.log(`Project: ${project.id} (${project.title}) stage=${project.stage ?? '?'}`);

  let assetId: string | undefined;
  if (!args.skipUpload) {
    const bytes = await readFile(dummyPath);
    const form = new FormData();
    form.append(
      'file',
      new Blob([bytes], { type: 'video/mp4' }),
      'dummy.mp4',
    );
    const upRes = await fetch(`${apiBase}/assets`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    if (!upRes.ok) {
      console.error('Upload failed:', upRes.status, await upRes.text());
      process.exit(1);
    }
    const asset = await parseJson<AssetDto>(upRes);
    assetId = asset.id;
    console.log(`Asset:   ${assetId} (${asset.name ?? 'dummy.mp4'})`);

    const attRes = await fetch(`${apiBase}/projects/${project.id}/assets`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ assetIds: [assetId] }),
    });
    if (!attRes.ok) {
      console.error('Attach failed:', attRes.status, await attRes.text());
      process.exit(1);
    }
    console.log('Attached asset to project');
  }

  let scriptId: string | undefined;
  if (!args.skipScript) {
    const scRes = await fetch(`${apiBase}/projects/${project.id}/scripts`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        title: parsedScript.title,
        source: 'USER',
        content: {
          hook: parsedScript.hook,
          body: parsedScript.body,
          cta: parsedScript.cta,
          title: parsedScript.title,
          rawText: parsedScript.rawText,
        },
      }),
    });
    if (!scRes.ok) {
      console.error('Create script failed:', scRes.status, await scRes.text());
      process.exit(1);
    }
    const script = await parseJson<ScriptDto>(scRes);
    scriptId = script.id;
    console.log(`Script:  ${scriptId} (${script.title ?? parsedScript.title})`);
  }

  console.log(`
Seed complete.

Login:   ${DEMO_EMAIL} / ${DEMO_PASSWORD}
Project: ${webBase}/projects/${project.id}
Judge:   docs/demo/judge-script.md
Offline: docs/demo/offline-fallbacks.md

IDs:
  projectId=${project.id}
  assetId=${assetId ?? '(skipped)'}
  scriptId=${scriptId ?? '(skipped)'}

Next (UI): Footage & Mapping → Transcribe → Align → Clips → Editor → Platform Packs
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
