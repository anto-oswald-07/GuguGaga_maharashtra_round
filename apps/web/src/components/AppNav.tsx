"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/assets", label: "Assets" },
  { href: "/projects", label: "Projects" },
  { href: "/workflow", label: "Workflow" },
  { href: "/jobs", label: "Jobs" },
  { href: "/insights", label: "Insights" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Register" },
] as const;

export function AppNav() {
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
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-[var(--foreground)]"
            >
              {link.label}
            </Link>
          ))}
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
