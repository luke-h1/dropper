import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformBadge } from "@/components/platform-badge";
import { hasAccess } from "@/lib/auth";
import { listBuilds } from "@/lib/builds";
import { formatBytes, formatRelative } from "@/lib/format";
import type { Platform } from "@/lib/types";

const FILTERS: { label: string; value?: Platform }[] = [
  { label: "All" },
  { label: "iOS", value: "ios" },
  { label: "Android", value: "android" },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  if (!(await hasAccess())) redirect("/login");
  const { platform } = await searchParams;
  const builds = (await listBuilds()).filter((b) => !platform || b.platform === platform);

  return (
    <main>
      <nav className="mb-4 flex gap-1 text-sm">
        {FILTERS.map((filter) => {
          const active = platform === filter.value;
          return (
            <Link
              key={filter.label}
              href={filter.value ? `/?platform=${filter.value}` : "/"}
              className={`rounded-full px-3 py-1 ${
                active
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {builds.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No builds yet. Upload one with{" "}
          <code className="font-mono">node dropper.mjs upload ./build.ipa</code>
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          {builds.map((build) => (
            <li key={build.id}>
              <Link
                href={`/b/${build.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{build.name}</span>
                    <PlatformBadge platform={build.platform} />
                    {build.profile && (
                      <span className="truncate text-xs text-neutral-500">{build.profile}</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sm text-neutral-500">
                    {build.version} ({build.buildNumber})
                    {build.gitBranch && ` · ${build.gitBranch}`}
                    {build.gitCommit && ` · ${build.gitCommit.slice(0, 7)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm text-neutral-500">
                  <div>{formatRelative(build.uploadedAt)}</div>
                  <div className="text-xs">{formatBytes(build.size)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
