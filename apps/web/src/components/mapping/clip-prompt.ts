import type { ScriptScene } from "@/lib/api";

export type ClipPromptStyle =
  | "cinematic"
  | "tech"
  | "studio"
  | "documentary"
  | "stylized";

export type ClipPromptCamera =
  | "push-in"
  | "orbit"
  | "handheld"
  | "static"
  | "dynamic";

export type ClipPromptOptions = {
  title: string;
  spokenText?: string;
  beatType?: string;
  visualBrief?: string;
  targetDurationMs?: number;
  scriptTopic?: string | null;
  style?: ClipPromptStyle;
  camera?: ClipPromptCamera;
};

export const STYLE_LABELS: Record<ClipPromptStyle, { label: string; icon: string }> = {
  cinematic: { label: "Cinematic", icon: "🎬" },
  tech: { label: "Tech / Modern", icon: "⚡" },
  studio: { label: "Studio Clean", icon: "🎙️" },
  documentary: { label: "Documentary", icon: "🌿" },
  stylized: { label: "Stylized 3D", icon: "🎨" },
};

export const CAMERA_LABELS: Record<ClipPromptCamera, string> = {
  "push-in": "Slow Push-In",
  orbit: "Orbit Arc",
  handheld: "Handheld",
  dynamic: "Dynamic Pan",
  static: "Locked Static",
};

/**
 * Builds a production-ready video generation prompt tailored for modern
 * AI video generators (Runway Gen-3, Kling, Sora, Pika, Luma Dream Machine).
 */
export function buildClipPrompt(opts: ClipPromptOptions): string {
  const durationSec = Math.max(
    1,
    Math.min(30, Math.round((opts.targetDurationMs ?? 3000) / 1000)),
  );
  const beat = (opts.beatType || "POINT").toUpperCase();
  const style: ClipPromptStyle = opts.style || "cinematic";
  const camera: ClipPromptCamera =
    opts.camera ||
    (beat === "HOOK" ? "push-in" : beat === "CTA" ? "orbit" : "dynamic");

  let subjectLead = "";
  if (beat === "HOOK") {
    subjectLead =
      "High-impact visual hook. Dynamic close-up or striking visual metaphor";
  } else if (beat === "CTA") {
    subjectLead =
      "High-energy closing payoff. Clean framing with negative space for bold caption overlay";
  } else if (beat === "TRANSITION") {
    subjectLead = "Seamless kinetic transition cutaway";
  } else {
    subjectLead = "Engaging B-roll sequence. Crisp visual storytelling";
  }

  const cleanSpoken = (opts.spokenText || "").trim().replace(/["\n]+/g, " ");
  const cleanBrief = (opts.visualBrief || "").trim().replace(/["\n]+/g, " ");
  const cleanTopic = (opts.scriptTopic || "").trim().replace(/["\n]+/g, " ");

  let visualDescription = "";
  if (
    cleanBrief &&
    !cleanBrief.toLowerCase().includes("illustrating point") &&
    !cleanBrief.toLowerCase().includes("talking-head open")
  ) {
    visualDescription = cleanBrief;
  } else if (cleanSpoken) {
    visualDescription = `illustrating the concept: "${cleanSpoken.slice(0, 160)}"`;
  } else {
    visualDescription = `illustrating ${opts.title}${cleanTopic ? ` in the context of ${cleanTopic}` : ""}`;
  }

  const cameraDescriptions: Record<ClipPromptCamera, string> = {
    "push-in":
      "slow push-in tracking shot, shallow depth of field (f/1.8), smooth cinematic gimbal movement",
    orbit:
      "subtle 360-degree orbit around the subject, dynamic parallax effect",
    handheld:
      "handheld documentary realism, natural subtle sway, authentic camera movement",
    static:
      "locked-off tripod shot, crisp symmetrical framing, focused depth of field",
    dynamic:
      "kinetic camera motion, fluid pan with rack focus, modern commercial pacing",
  };
  const cameraMotion = cameraDescriptions[camera] ?? cameraDescriptions.dynamic;

  const styleDescriptions: Record<ClipPromptStyle, string> = {
    cinematic:
      "35mm anamorphic lens, cinematic volumetric lighting, rich color grade, dramatic contrast, photorealistic 8K UHD",
    tech:
      "modern creator tech studio, neon edge rim lights, sleek dark aesthetics, crisp clean reflections, ultra-detailed",
    studio:
      "bright minimalist studio, soft diffused warm key light, neutral pastel palette, pristine commercial aesthetic",
    documentary:
      "natural daylight illumination, candid realistic setting, 24fps film grain, organic colors, authentic lifestyle feel",
    stylized:
      "vibrant stylized 3D aesthetics, bold saturated lighting, contemporary graphic depth, polished render",
  };
  const aesthetic = styleDescriptions[style] ?? styleDescriptions.cinematic;

  const specs = `vertical 9:16 aspect ratio, mobile video, ~${durationSec}s duration, photorealistic quality`;

  return `${subjectLead} ${visualDescription}. ${cameraMotion}, ${aesthetic}. ${specs}.`;
}

/**
 * Formats all scenes into a numbered batch-prompt document ready to paste into
 * multi-prompt batch runners, Notion boards, or script storyboards.
 */
export function formatAllScenePrompts(
  scenes: ScriptScene[],
  scriptTopic?: string | null,
  style: ClipPromptStyle = "cinematic",
): string {
  if (scenes.length === 0) return "";

  const lines: string[] = [
    `# AI Clip Generation Prompts (${STYLE_LABELS[style].label} Style)`,
    scriptTopic ? `Project Topic: ${scriptTopic}` : "",
    `Total Scenes: ${scenes.length}`,
    "Generated for Runway Gen-3, Kling, Sora, Pika, Midjourney",
    "--------------------------------------------------",
    "",
  ].filter(Boolean);

  scenes.forEach((scene, idx) => {
    const prompt = buildClipPrompt({
      title: scene.title,
      spokenText: scene.spokenText,
      beatType: scene.beatType,
      visualBrief: scene.visualBrief,
      targetDurationMs: scene.targetDurationMs,
      scriptTopic,
      style,
    });
    lines.push(
      `## Scene ${idx + 1}: ${scene.title} [${scene.beatType}] (~${Math.round(scene.targetDurationMs / 1000)}s)`,
      `Spoken: "${scene.spokenText}"`,
      `Prompt:\n${prompt}`,
      "",
    );
  });

  return lines.join("\n");
}
