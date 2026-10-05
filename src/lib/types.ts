export type Platform = "ios" | "android";

/** What the CLI reads from the binary and sends when it starts an upload. */
export interface BuildInput {
  platform: Platform;
  fileName: string;
  size: number;
  name: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  /** iOS only: "ad-hoc" | "development" | "enterprise" | "app-store" */
  distribution?: string;
  /** iOS only: when the embedded provisioning profile expires (ISO 8601) */
  profileExpiresAt?: string;
  profile?: string;
  channel?: string;
  gitBranch?: string;
  gitCommit?: string;
  notes?: string;
}

export interface Build extends BuildInput {
  id: string;
  key: string;
  uploadedAt: string;
}
