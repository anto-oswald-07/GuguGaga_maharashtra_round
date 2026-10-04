/**
 * Generate a simple title-card MP4 for an empty script scene (demo AI fill).
 * Uses lavfi color + drawtext when ffmpeg is available; otherwise writes a
 * tiny placeholder text file registered as DOCUMENT (still fulfills the slot).
 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export type GenerateSceneMediaResult = {
  absolutePath: string;
  mime: string;
  extension: string;
  mode: 'ffmpeg' | 'placeholder';
  durationMs: number;
};

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ')
    .slice(0, 80);
}

async function hasFfmpeg(): Promise<boolean> {
  for (const bin of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    try {
      await access(bin, constants.X_OK);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || `ffmpeg exit ${code}`));
    });
  });
}

/**
 * Write scene media under `outputDir/scene-{sceneId}.mp4` (or .txt fallback).
 */
export async function generateScenePlaceholderMedia(opts: {
  outputDir: string;
  sceneId: string;
  title: string;
  spokenText: string;
  durationMs: number;
  prompt?: string;
}): Promise<GenerateSceneMediaResult> {
  await mkdir(opts.outputDir, { recursive: true });
  const durationSec = Math.max(1, Math.min(45, Math.round(opts.durationMs / 1000) || 5));
  const label = escapeDrawtext(opts.title || 'Scene');
  const spokenTrimmed = (opts.spokenText || '').trim();
  const subText =
    spokenTrimmed.length > 40
      ? `${spokenTrimmed.slice(0, 37).trimEnd()}…`
      : spokenTrimmed;
  const sub = escapeDrawtext(subText);
  const promptDraw = opts.prompt ? escapeDrawtext(`Prompt: ${opts.prompt.slice(0, 45)}`) : '';

  if (await hasFfmpeg()) {
    const absolutePath = path.join(opts.outputDir, `scene-${opts.sceneId}.mp4`);
    const filter = [
      `drawtext=text='${label}':fontsize=40:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-${promptDraw ? 50 : 35}`,
      `drawtext=text='${sub}':fontsize=24:fontcolor=white@0.9:box=1:boxcolor=black@0.5:boxborderw=4:x=(w-text_w)/2:y=(h-text_h)/2+${promptDraw ? 10 : 35}`,
      ...(promptDraw
        ? [`drawtext=text='${promptDraw}':fontsize=18:fontcolor=0xffd700@0.9:x=(w-text_w)/2:y=(h-text_h)/2+60`]
        : []),
    ].join(',');
    try {
      await runFfmpeg([
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x16213e:s=1080x1920:d=${durationSec}`,
        '-f',
        'lavfi',
        '-i',
        `anullsrc=r=44100:cl=stereo`,
        '-vf',
        filter,
        '-t',
        String(durationSec),
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-shortest',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        absolutePath,
      ]);
      return {
        absolutePath,
        mime: 'video/mp4',
        extension: 'mp4',
        mode: 'ffmpeg',
        durationMs: durationSec * 1000,
      };
    } catch {
      // fall through to placeholder
    }
  }

  const absolutePath = path.join(opts.outputDir, `scene-${opts.sceneId}.txt`);
  await writeFile(
    absolutePath,
    [
      `CreatorAi AI scene placeholder`,
      `Title: ${opts.title}`,
      `DurationMs: ${opts.durationMs}`,
      '',
      opts.spokenText,
    ].join('\n'),
    'utf8',
  );
  return {
    absolutePath,
    mime: 'text/plain',
    extension: 'txt',
    mode: 'placeholder',
    durationMs: opts.durationMs,
  };
}
