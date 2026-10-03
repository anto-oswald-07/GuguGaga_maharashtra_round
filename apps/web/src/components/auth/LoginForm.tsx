"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "@/lib/api";
import { setToken } from "@/lib/auth-storage";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const result = await login({ email, password });
      setToken(result.token);
      router.push("/dashboard");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Login failed";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Login</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sign in to your CreatorAi workspace.
        </p>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--brand)]"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">Password</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        disabled={pending}
        className="w-full rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-[var(--muted)]">
        Need an account?{" "}
        <Link href="/register" className="text-[var(--brand)] hover:underline">
          Register
        </Link>
      </p>
    </form>
  );
}
