"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { ApiError, Asset, uploadAsset } from "@/lib/api";
import { ClipPlayer } from "@/components/assets/ClipPlayer";

type AssetUploadProps = {
  onUploaded: () => void;
};

const ACCEPT =
  "video/*,image/*,audio/*,.pdf,.doc,.docx,.txt,.md,application/pdf,text/plain";

export function AssetUpload({ onUploaded }: AssetUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadedAsset, setUploadedAsset] = useState<Asset | null>(null);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setUploadedAsset(null);
    if (next && !name) setName(next.name);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      const uploaded = await uploadAsset(file, { name, tags });
      setUploadedAsset(uploaded);
      setFile(null);
      setName("");
      setTags("");
      (event.target as HTMLFormElement).reset();
      onUploaded();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Upload failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Upload asset</h2>
        <p className="text-sm text-[var(--muted)]">
          Video, image, audio, or document (multipart).
        </p>
      </div>

      <div className="space-y-1.5 text-sm">
        <label htmlFor="asset-file-upload-input" className="block font-medium">
          Choose Media File
        </label>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="asset-file-upload-input"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--brand)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-[var(--brand)]/90 active:scale-95"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Choose File
            </label>
            <input
              id="asset-file-upload-input"
              type="file"
              accept={ACCEPT}
              onChange={onFileChange}
              className="block w-full max-w-md text-sm text-[var(--foreground)] file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[var(--brand)] file:text-white hover:file:bg-[var(--brand)]/90 cursor-pointer border border-[var(--border)] rounded-md bg-white p-1"
            />
          </div>
          <span className="text-xs text-[var(--muted)] truncate max-w-sm">
            {file ? (
              <span className="font-medium text-emerald-700">
                Selected file: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
              </span>
            ) : (
              "No file chosen yet"
            )}
          </span>
        </div>
      </div>

      {file ? (
        <div className="space-y-1.5 rounded-md border border-[var(--border)] bg-slate-50 p-2.5">
          <div className="flex items-center justify-between text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--foreground)]">Selected Clip Preview</span>
            <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
          </div>
          <ClipPlayer file={file} title={name || file.name} />
        </div>
      ) : null}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Display name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Tags (comma-separated)</span>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="hook, b-roll"
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
        />
      </label>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !file}
        className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>

      {uploadedAsset ? (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/70 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-950">Successfully uploaded clip</span>
            <button
              type="button"
              onClick={() => setUploadedAsset(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 underline"
            >
              Dismiss
            </button>
          </div>
          <ClipPlayer
            assetId={uploadedAsset.id}
            title={uploadedAsset.name}
            type={uploadedAsset.type}
            mime={uploadedAsset.mime}
          />
        </div>
      ) : null}
    </form>
  );
}
