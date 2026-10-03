"use client";

import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth-storage";

export function LogoutButton() {
  const router = useRouter();

  function onLogout() {
    clearToken();
    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      className="rounded-md border border-[var(--border)] px-2 py-1 text-sm text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--foreground)]"
    >
      Logout
    </button>
  );
}
