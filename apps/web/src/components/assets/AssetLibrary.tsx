"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  Asset,
  AssetType,
  listAssets,
} from "@/lib/api";
import { hasToken } from "@/lib/auth-storage";
import { AssetCard } from "@/components/assets/AssetCard";
import { AssetDetailDrawer } from "@/components/assets/AssetDetailDrawer";
import { AssetFilters } from "@/components/assets/AssetFilters";
import { AssetUpload } from "@/components/assets/AssetUpload";

export function AssetLibrary() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [type, setType] = useState<AssetType | "">("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasToken()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(handle);
  }, [q]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAssets({
        type: type || undefined,
        q: debouncedQ || undefined,
      });
      setAssets(result.assets ?? []);
    } catch (err) {
      setAssets([]);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load assets",
      );
    } finally {
      setLoading(false);
    }
  }, [type, debouncedQ]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  if (!ready) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-12">
        <p className="text-[var(--muted)]">Checking session…</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Asset library</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Upload, filter, tag, and soft-delete workspace media.
        </p>
      </div>

      <AssetUpload onUploaded={refresh} />

      <AssetFilters
        type={type}
        q={q}
        onTypeChange={setType}
        onQueryChange={setQ}
      />

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)]">Loading assets…</p>
      ) : null}

      {!loading && assets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
          <p className="font-medium text-[var(--foreground)]">No assets yet</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upload an image or the dummy MP4 from{" "}
            <code className="text-xs">storage/samples/dummy.mp4</code> to get started.
          </p>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onOpen={setSelected} />
          ))}
        </div>
      ) : null}

      <AssetDetailDrawer
        asset={selected}
        onClose={() => setSelected(null)}
        onChanged={refresh}
      />
    </section>
  );
}
