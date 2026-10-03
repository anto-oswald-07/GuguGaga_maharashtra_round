"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { hasToken } from "@/lib/auth-storage";

const appLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/assets", label: "Assets" },
  { href: "/projects", label: "Projects" },
  { href: "/workflow", label: "Workflow" },
  { href: "/jobs", label: "Jobs" },
  { href: "/insights", label: "Insights" },
] as const;

const guestLinks = [
  { href: "/#features", label: "Features" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Register" },
] as const;

export function AppNav() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setAuthed(hasToken());
    const t = window.setTimeout(sync, 0);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("creatorai-auth", sync);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("creatorai-auth", sync);
    };
  }, []);

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-[var(--brand)]"
        >
          CreatorAi
        </Link>
        <nav className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
          {authed === null ? null : authed ? (
            <>
              {appLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="hover:text-[var(--foreground)]"
                >
                  {link.label}
                </Link>
              ))}
              <LogoutButton />
            </>
          ) : (
            guestLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-[var(--foreground)]"
              >
                {link.label}
              </Link>
            ))
          )}
        </nav>
      </div>
    </header>
  );
}
