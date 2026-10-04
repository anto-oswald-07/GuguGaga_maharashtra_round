"use client";

import { formatTimecode, type Asset, type TimelineJson } from "@/lib/api";
import { useEditorStore } from "@/components/editor/editor-store";

type AiSuggestPanelProps = {
  pending?: boolean;
  assets?: Asset[];
  onSuggest: () => void;
  onApply: () => void;
  onApplyAudio?: (audioAsset?: Asset) => Promise<void> | void;
  onApplyCaptionsAndText?: () => Promise<void> | void;
};

function proposalSummary(proposal: TimelineJson) {
  const video = proposal.tracks.find((t) => t.type === "video");
  const text = proposal.tracks.find((t) => t.type === "text");
  const audio = proposal.tracks.find((t) => t.type === "audio");
  const caps = proposal.tracks.find((t) => t.type === "captions");
  const clips = video && video.type === "video" ? video.clips.length : 0;
  const audioClips = audio && audio.type === "audio" ? audio.clips.length : 0;
  const overlays = text && text.type === "text" ? text.items.length : 0;
  const captionCues = caps && caps.type === "captions" ? caps.items.length : 0;
  return `${clips} clip(s) sequenced · ${audioClips} audio track(s) · ${overlays} text overlay(s) · ${captionCues} caption cue(s) · ${formatTimecode(proposal.durationMs)}`;
}

export function AiSuggestPanel({
  pending,
  assets,
  onSuggest,
  onApply,
  onApplyAudio,
  onApplyCaptionsAndText,
}: AiSuggestPanelProps) {
  const {
    state,
    dismissProposal,
    applyAudioSuggestion,
    applyCaptionsAndTextSuggestion,
  } = useEditorStore();
  const proposal = state.proposal;

  const audioTrack = proposal?.tracks.find((t) => t.type === "audio");
  const audioClips =
    audioTrack && audioTrack.type === "audio" ? audioTrack.clips : [];

  const audioAsset = (assets ?? []).find(
    (a) => (a.type === "AUDIO" || a.mime?.startsWith("audio/")) && !a.deletedAt,
  );

  const draftAudioTrack = state.draft.tracks.find((t) => t.type === "audio");
  const draftAudioClips =
    draftAudioTrack && draftAudioTrack.type === "audio" ? draftAudioTrack.clips : [];
  const hasAppliedAudio = draftAudioClips.length > 0;

  async function handleApplyAudio() {
    if (onApplyAudio) {
      await onApplyAudio(audioAsset);
    } else {
      applyAudioSuggestion({
        fallbackAssetId: audioAsset?.id,
        fallbackLabel: audioAsset?.name || "Background Music",
      });
    }
  }

  async function handleApplyCaptionsAndText() {
    if (onApplyCaptionsAndText) {
      await onApplyCaptionsAndText();
    } else {
      applyCaptionsAndTextSuggestion();
    }
  }

  const textTrack = proposal?.tracks.find((t) => t.type === "text");
  const textItems =
    textTrack && textTrack.type === "text" ? textTrack.items : [];

  const capTrack = proposal?.tracks.find((t) => t.type === "captions");
  const capItems =
    capTrack && capTrack.type === "captions" ? capTrack.items : [];

  const hookOverlay = textItems.find((i) => i.startMs === 0);

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            AI Edit Suggestions
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Analyze footage and get AI recommendations for background music, dialogue captions, and text overlays.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onSuggest}
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-slate-50"
        >
          {pending ? "Analyzing…" : proposal ? "Re-suggest edits" : "AI Suggest"}
        </button>
      </div>

      {proposal ? (
        <div className="mt-3 space-y-3 rounded-md border border-amber-200 bg-amber-50/80 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70 pb-2">
            <span className="font-medium text-xs text-amber-950 uppercase tracking-wide">
              Suggestions available for this sequence
            </span>
            <span className="text-xs text-amber-900/80">
              {proposalSummary(proposal)}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Audio & Music Suggestion Card */}
            <div className="rounded border border-amber-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-950">
                  Audio &amp; Music
                </h3>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  {audioClips.length > 0 ? "Track Attached" : audioAsset ? "Ready to Attach" : "Recommended"}
                </span>
              </div>
              <p className="text-xs text-slate-700">
                {audioClips.length > 0
                  ? `Background audio track synced to video duration (${formatTimecode(proposal.durationMs)}). Auto-ducked -14dB under voiceover.`
                  : audioAsset
                    ? `Attach "${audioAsset.name}" as background audio track synced to sequence duration, auto-ducked under speech.`
                    : "Lo-Fi / Corporate Pop background track recommended at 120 BPM, ducked -14dB under speech to maximize retention."}
              </p>
              {audioClips[0] ? (
                <p className="text-[11px] text-[var(--muted)] font-mono truncate">
                  Track: {audioClips[0].label || "Background Music"}
                </p>
              ) : audioAsset ? (
                <p className="text-[11px] text-amber-900 font-medium truncate">
                  Project Track: {audioAsset.name}
                </p>
              ) : (
                <p className="text-[11px] text-amber-800/80 italic">
                  Tip: Upload an audio track in Media Bin or Footage &amp; Scenes to apply it here.
                </p>
              )}
              <button
                type="button"
                disabled={pending || (!audioClips.length && !audioAsset)}
                onClick={handleApplyAudio}
                className="w-full rounded bg-amber-100/80 border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-40"
              >
                Apply Audio &amp; Music
              </button>
            </div>

            {/* Captions & Text Suggestion Card */}
            <div className="rounded border border-amber-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-950">
                  Captions &amp; Text
                </h3>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  {capItems.length + textItems.length} Cues
                </span>
              </div>
              <p className="text-xs text-slate-700">
                {hookOverlay
                  ? `Hook overlay at 0–3s ("${hookOverlay.text.slice(0, 45)}…") + ${capItems.length} synchronized dialogue subtitle cue(s).`
                  : `${capItems.length} dialogue caption cue(s) synchronized to clip beats with scene callout overlays.`}
              </p>
              <p className="text-[11px] text-[var(--muted)]">
                Includes retention-boosting lower-thirds and bold hook styling.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={applyCaptionsAndTextSuggestion}
                className="w-full rounded bg-amber-100/80 border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-40"
              >
                Apply Captions &amp; Text
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={onApply}
              className="rounded-md bg-amber-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-950 disabled:opacity-40"
            >
              Apply All Suggestions (Audio + Captions + Text)
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={dismissProposal}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-950 hover:bg-amber-50 disabled:opacity-40"
            >
              Dismiss suggestions
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between rounded-md border border-[var(--border)] bg-white px-3 py-2.5">
          <p className="text-xs text-[var(--muted)]">
            No active suggestions. Click &quot;AI Suggest&quot; to analyze footage and propose edits for audio, captions, and text.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={onSuggest}
            className="rounded bg-[var(--brand)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
          >
            AI Suggest
          </button>
        </div>
      )}
    </section>
  );
}
