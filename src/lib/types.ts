import * as z from 'zod/mini';

const required = z.string().check(z.minLength(1), z.maxLength(200));

const optional = (max = 200) =>
  z.pipe(
    z.transform((value) => value || undefined),
    z.optional(z.string().check(z.maxLength(max))),
  );

export const BuildInput = z.object({
  platform: z.enum(['ios', 'android']),
  fileName: required,
  size: z.int().check(z.positive()),
  name: required,
  bundleId: required,
  version: required,
  buildNumber: required,
  // iOS only: "ad-hoc" | "development" | "enterprise" | "app-store"
  distribution: optional(),
  // iOS only: when the embedded provisioning profile expires (ISO 8601)
  profileExpiresAt: optional(),
  profile: optional(),
  channel: optional(),
  gitBranch: optional(),
  gitCommit: optional(),
  notes: optional(2000),
});

export type BuildInput = z.infer<typeof BuildInput>;

export type Platform = BuildInput['platform'];

export const Build = z.extend(BuildInput, {
  id: z.string(),
  key: z.string(),
  uploadedAt: z.string(),
});

export type Build = z.infer<typeof Build>;
