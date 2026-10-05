import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { grantAccess, hasAccess } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

async function login(formData: FormData) {
  "use server";
  const ok = await grantAccess(String(formData.get("password") ?? ""));
  redirect(ok ? "/" : "/login?error=1");
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await hasAccess()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="mx-auto mt-16 max-w-xs">
      <form action={login} className="grid gap-3">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">Wrong password</p>}
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
