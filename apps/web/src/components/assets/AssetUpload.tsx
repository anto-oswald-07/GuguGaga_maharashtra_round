"use client";

import { ChangeEvent, FormEvent, useState } from "react";
import { ApiError, uploadAsset } from "@/lib/api";

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

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
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
      await uploadAsset(file, { name, tags });
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

      <label className="block space-y-1 text-sm">
        <span className="font-medium">File</span>
        <input
          type="file"
          accept={ACCEPT}
          onChange={onFileChange}
          className="block w-full text-sm"
        />
      </label>

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
    </form>
  );
}
