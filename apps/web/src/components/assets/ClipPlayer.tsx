"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadAssetFile, getAssetDownloadUrl } from "@/lib/api";

export type ClipPlayerProps = {
  assetId?: string;
  file?: File | null;
  src?: string;
  title?: string;
  type?: string;
  mime?: string;
  className?: string;
  autoPlay?: boolean;
  onClose?: () => void;
};

export function ClipPlayer({
  assetId,
  file,
  src,
  title,
  type,
  mime,
  className = "",
  autoPlay = false,
  onClose,
}: ClipPlayerProps) {
  const [loadError, setLoadError] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setLocalUrl(url);
      setLoadError(false);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    setLocalUrl(null);
  }, [file]);

  const mediaUrl = useMemo(() => {
    if (localUrl) return localUrl;
    if (src) return src;
    if (assetId) return getAssetDownloadUrl(assetId);
    return null;
  }, [localUrl, src, assetId]);

  const isVideo = useMemo(() => {
    if (file) return file.type.startsWith("video/") || file.name.match(/\.(mp4|mov|webm|mkv)$/i);
    if (type) return type.toUpperCase() === "VIDEO";
    if (mime) return mime.startsWith("video/");
    if (title) return title.match(/\.(mp4|mov|webm|mkv)$/i);
    return true; // Default to video for clips
  }, [file, type, mime, title]);

  const isAudio = useMemo(() => {
    if (file) return file.type.startsWith("audio/") || file.name.match(/\.(mp3|wav|m4a|aac|ogg)$/i);
    if (type) return type.toUpperCase() === "AUDIO";
    if (mime) return mime.startsWith("audio/");
    if (title) return title.match(/\.(mp3|wav|m4a|aac|ogg)$/i);
    return false;
  }, [file, type, mime, title]);

  const isImage = useMemo(() => {
    if (file) return file.type.startsWith("image/") || file.name.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i);
    if (type) return type.toUpperCase() === "IMAGE";
    if (mime) return mime.startsWith("image/");
    if (title) return title.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i);
    return false;
  }, [file, type, mime, title]);

  if (!mediaUrl) return null;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-[var(--border)] bg-slate-900 text-white shadow-md ${className}`}
    >
      {/* Top player header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase text-slate-300">
            {isVideo ? "Video" : isAudio ? "Audio" : isImage ? "Image" : "Media"}
          </span>
          <span className="truncate font-medium text-slate-200">
            {title || (file ? file.name : "Clip Preview")}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {assetId ? (
            <button
              type="button"
              onClick={() => void downloadAssetFile(assetId, title)}
              className="text-[11px] text-slate-400 hover:text-white transition"
              title="Download original file"
            >
              Download
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white transition text-xs font-medium"
              title="Close preview"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      {/* Media rendering */}
      <div className="relative flex items-center justify-center bg-black p-1 min-h-[140px]">
        {loadError ? (
          <div className="p-4 text-center text-xs text-slate-400">
            <p className="font-semibold text-slate-300">Unable to preview format in browser.</p>
            {assetId ? (
              <button
                type="button"
                onClick={() => void downloadAssetFile(assetId, title)}
                className="mt-2 inline-block rounded bg-[var(--brand)] px-2.5 py-1 text-xs text-white"
              >
                Download to view
              </button>
            ) : null}
          </div>
        ) : isVideo ? (
          <video
            src={mediaUrl}
            controls
            playsInline
            autoPlay={autoPlay}
            onError={() => setLoadError(true)}
            className="max-h-[340px] w-full rounded object-contain"
          />
        ) : isAudio ? (
          <div className="w-full p-4">
            <audio
              src={mediaUrl}
              controls
              autoPlay={autoPlay}
              onError={() => setLoadError(true)}
              className="w-full"
            />
          </div>
        ) : isImage ? (
          <img
            src={mediaUrl}
            alt={title || "Preview"}
            onError={() => setLoadError(true)}
            className="max-h-[340px] w-full rounded object-contain"
          />
        ) : (
          <div className="p-6 text-center text-xs text-slate-400">
            <p>Document or generic asset: {title}</p>
            {assetId ? (
              <button
                type="button"
                onClick={() => void downloadAssetFile(assetId, title)}
                className="mt-2 rounded bg-slate-800 px-2 py-1 text-white hover:bg-slate-700"
              >
                Download File
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
