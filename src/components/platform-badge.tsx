import type { Platform } from "@/lib/types";

export function PlatformBadge({ platform }: { platform: Platform }) {
  const ios = platform === "ios";
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${
        ios
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      }`}
    >
      {ios ? "iOS" : "Android"}
    </span>
  );
}
