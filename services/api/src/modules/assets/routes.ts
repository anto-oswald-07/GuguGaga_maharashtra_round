import type { FastifyInstance } from 'fastify';
import {
  API_PREFIX,
  assetListQuerySchema,
  updateAssetRequestSchema,
} from '@creatorai/shared';
import { requireAuth } from '../../auth/jwt';
import { storage } from '../../storage/local';
import {
  AssetHttpError,
  getAsset,
  getAssetForContent,
  getAssetThumbnail,
  listAssets,
  softDeleteAsset,
  updateAsset,
  uploadAsset,
} from './service';

function sendAssetError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  err: AssetHttpError,
) {
  return reply.status(err.statusCode).send({
    error: err.error,
    message: err.message,
    statusCode: err.statusCode,
  });
}

function parseTagsField(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((t) => t.trim()).filter(Boolean);
    }
  } catch {
    // comma-separated fallback
  }
  return trimmed
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function registerAssetRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    `${API_PREFIX}/assets`,
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        let fileBuffer: Buffer | null = null;
        let filename = 'upload.bin';
        let mimetype = 'application/octet-stream';
        const fields: Record<string, string> = {};

        for await (const part of request.parts()) {
          if (part.type === 'file') {
            filename = part.filename || 'upload.bin';
            mimetype = part.mimetype || 'application/octet-stream';
            fileBuffer = await part.toBuffer();
          } else {
            fields[part.fieldname] = String(part.value ?? '');
          }
        }

        if (!fileBuffer) {
          return reply.status(400).send({
            error: 'validation_error',
            message: 'Expected multipart file field',
            statusCode: 400,
          });
        }

        const asset = await uploadAsset({
          workspaceId: request.auth!.workspaceId,
          filename,
          mime: mimetype,
          data: fileBuffer,
          name: fields.name,
          description: fields.description ?? null,
          tags: parseTagsField(fields.tags),
        });

        return reply.status(201).send(asset);
      } catch (err) {
        if (err instanceof AssetHttpError) {
          return sendAssetError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/assets`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = assetListQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const result = await listAssets(
          request.auth!.workspaceId,
          parsed.data,
        );
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof AssetHttpError) {
          return sendAssetError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/assets/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const asset = await getAsset(request.auth!.workspaceId, id);
        return reply.status(200).send(asset);
      } catch (err) {
        if (err instanceof AssetHttpError) {
          return sendAssetError(reply, err);
        }
        throw err;
      }
    },
  );

  app.patch(
    `${API_PREFIX}/assets/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateAssetRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_error',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          statusCode: 400,
        });
      }
      try {
        const asset = await updateAsset(
          request.auth!.workspaceId,
          id,
          parsed.data,
        );
        return reply.status(200).send(asset);
      } catch (err) {
        if (err instanceof AssetHttpError) {
          return sendAssetError(reply, err);
        }
        throw err;
      }
    },
  );

  app.delete(
    `${API_PREFIX}/assets/:id`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await softDeleteAsset(request.auth!.workspaceId, id);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof AssetHttpError) {
          return sendAssetError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/assets/:id/content`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const meta = await getAssetForContent(request.auth!.workspaceId, id);
        const stream = storage.openReadStream(meta.path);
        return reply
          .header('Content-Type', meta.mime)
          .header(
            'Content-Disposition',
            `inline; filename="${meta.name.replace(/"/g, '')}"`,
          )
          .send(stream);
      } catch (err) {
        if (err instanceof AssetHttpError) {
          return sendAssetError(reply, err);
        }
        throw err;
      }
    },
  );

  app.get(
    `${API_PREFIX}/assets/:id/thumbnail`,
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const thumb = await getAssetThumbnail(request.auth!.workspaceId, id);
        const stream = storage.openReadStream(thumb.path);
        return reply
          .header('Content-Type', thumb.mime)
          .header('Cache-Control', 'private, max-age=3600')
          .send(stream);
      } catch (err) {
        if (err instanceof AssetHttpError) {
          return sendAssetError(reply, err);
        }
        throw err;
      }
    },
  );
}
