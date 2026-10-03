"use client";

import { FormEvent, useState } from "react";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  type Platform,
} from "@/components/projects/constants";
import {
  ApiError,
  createProject,
} from "@/components/projects/project-api";

type ProjectCreateFormProps = {
  onCreated: () => void;
};

export function ProjectCreateForm({ onCreated }: ProjectCreateFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function togglePlatform(platform: Platform) {
    setPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform],
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setError(null);
    setPending(true);
    try {
      await createProject({
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        targetPlatforms: platforms,
      });
      setTitle("");
      setDescription("");
      setPlatforms([]);
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to create project",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div>
        <h2 className="text-sm font-semibold tracking-tight">New project</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Title, optional description, and target platforms.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          required
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          placeholder="Demo Reel Batch"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={5000}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          placeholder="What this project covers…"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Target platforms</legend>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => {
            const selected = platforms.includes(platform);
            return (
              <label
                key={platform}
                className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                    : "border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--brand)]/40"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected}
                  onChange={() => togglePlatform(platform)}
                />
                {PLATFORM_LABELS[platform]}
              </label>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
