"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasToken } from "@/lib/auth-storage";

const FEATURES = [
  {
    title: "AI scripts",
    body: "Generate platform-ready scripts from a topic, audience, and tone — then iterate versions.",
  },
  {
    title: "Footage & mapping",
    body: "Transcribe uploads, align lines to the script, and correct low-confidence mappings.",
  },
  {
    title: "Clip proposals",
    body: "Propose short-form windows, accept candidates, and render cuts with ffmpeg (or mock fallback).",
  },
  {
    title: "Timeline editor",
    body: "Suggest a timeline, tweak overlays and tracks, then re-render a preview.",
  },
  {
    title: "Platform packs",
    body: "Adapt one edit into Reels, Shorts, and more — mark ready, publish, and download.",
  },
  {
    title: "Insights & jobs",
    body: "Track workspace metrics, log engagement, and retry failed jobs from one queue.",
  },
] as const;

const FLOW = [
  "Script",
  "Footage",
  "Map",
  "Clips",
  "Editor",
  "Packs",
  "Publish",
] as const;

export function LandingPage() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const sync = () => setAuthed(hasToken());
    const t = window.setTimeout(sync, 0);
    window.addEventListener("creatorai-auth", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("creatorai-auth", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <div className="landing">
      <section className="landing-hero relative overflow-hidden">
        <div className="landing-hero-bg" aria-hidden />
        <div className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:py-20">
          <p className="landing-fade landing-delay-1 text-sm font-medium uppercase tracking-[0.2em] text-[var(--brand)]">
            CreatorAi
          </p>
          <h1 className="landing-fade landing-delay-2 mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl lg:text-6xl">
            One operating system for creator video — idea to published packs.
          </h1>
          <p className="landing-fade landing-delay-3 mt-5 max-w-xl text-base text-[var(--muted)] sm:text-lg">
            Plan scripts, map footage, cut clips, edit timelines, and ship
            platform packs with a demo-stable AI pipeline.
          </p>
          <div className="landing-fade landing-delay-4 mt-8 flex flex-wrap items-center gap-3">
            {authed ? (
              <Link
                href="/dashboard"
                className="rounded-md bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-md bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:border-[var(--brand)]"
                >
                  Log in
                </Link>
              </>
            )}
            <a
              href="#features"
              className="px-2 text-sm text-[var(--muted)] underline-offset-4 hover:text-[var(--brand)] hover:underline"
            >
              See features
            </a>
          </div>
        </div>
      </section>

      <section
        id="flow"
        className="border-t border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            Golden path
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            A single workspace walks a project from script through publish —
            the same flow judges run in the demo.
          </p>
          <ol className="landing-flow mt-8 flex flex-wrap gap-2 sm:gap-3">
            {FLOW.map((step, i) => (
              <li
                key={step}
                className="landing-flow-step flex items-center gap-2 text-sm"
              >
                <span className="inline-flex h-8 items-center rounded-md bg-[var(--brand-soft)] px-3 font-medium text-[var(--brand)]">
                  {step}
                </span>
                {i < FLOW.length - 1 ? (
                  <span className="hidden text-[var(--muted)] sm:inline" aria-hidden>
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            Built for the full creator loop
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Each surface maps to a real API module — auth, assets, jobs,
            mapping, clips, timelines, packs, and insights.
          </p>
          <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="landing-feature">
                <h3 className="text-base font-semibold text-[var(--brand)]">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  {feature.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            Ready when you are
          </h2>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
            Mock AI stays deterministic offline. Real ffmpeg hardens cuts when
            available. Cold-start in minutes from the README.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {authed ? (
              <Link
                href="/dashboard"
                className="rounded-md bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
              >
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="rounded-md bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-110"
                >
                  Create account
                </Link>
                <Link
                  href="/login"
                  className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium transition hover:border-[var(--brand)]"
                >
                  Log in
                </Link>
              </>
            )}
            <Link
              href="/workflow"
              className="rounded-md border border-[var(--border)] px-5 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--foreground)]"
            >
              View workflow
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
