import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream, type ReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';

/** Resolve STORAGE_ROOT against the monorepo root (not cwd). */
export function resolveStorageRoot(): string {
  const raw = process.env.STORAGE_ROOT ?? './storage';
  if (path.isAbsolute(raw)) {
    return raw;
  }
  // services/api/src/storage (tsx) OR services/api/dist/storage (compiled)
  // → monorepo root is four levels up either way.
  const repoRoot = path.resolve(__dirname, '../../../..');
  return path.resolve(repoRoot, raw);
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()+ ]+/g, '_').trim();
  return base.length > 0 ? base.slice(0, 180) : 'upload.bin';
}

export type SavedOriginal = {
  /** Relative path from STORAGE_ROOT, POSIX-style */
  relativePath: string;
  absolutePath: string;
  filename: string;
  size: number;
};

export class LocalFilesystemStorage {
  constructor(private readonly root: string = resolveStorageRoot()) {}

  getRoot(): string {
    return this.root;
  }

  absoluteFromRelative(relativePath: string): string {
    const abs = path.resolve(this.root, relativePath);
    const rootResolved = path.resolve(this.root);
    if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
      throw new Error('Path escapes storage root');
    }
    return abs;
  }

  /**
   * Save an original upload under:
   * `workspaces/{workspaceId}/originals/{assetId}/{filename}`
   */
  async saveOriginal(opts: {
    workspaceId: string;
    assetId?: string;
    filename: string;
    data: Buffer;
  }): Promise<SavedOriginal & { assetId: string }> {
    const assetId = opts.assetId ?? randomUUID();
    const filename = sanitizeFilename(opts.filename);
    const relativePath = path.posix.join(
      'workspaces',
      opts.workspaceId,
      'originals',
      assetId,
      filename,
    );
    const absolutePath = this.absoluteFromRelative(relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, opts.data);
    return {
      assetId,
      relativePath,
      absolutePath,
      filename,
      size: opts.data.byteLength,
    };
  }

  openReadStream(relativePath: string): ReadStream {
    return createReadStream(this.absoluteFromRelative(relativePath));
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.absoluteFromRelative(relativePath));
      return true;
    } catch {
      return false;
    }
  }
}

export const storage = new LocalFilesystemStorage();
