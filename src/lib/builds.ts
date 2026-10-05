import { S3 } from "./s3";
import type { Build, BuildInput } from "./types";

const PREFIX = "builds/";
const MAX_TIME = 10 ** 13;

/** Ids sort newest-first so S3's lexicographic listing returns the latest builds first. */
export function newBuildId(now = Date.now()): string {
  const reversed = (MAX_TIME - now).toString(36).padStart(9, "0");
  const random = crypto.getRandomValues(new Uint8Array(3));
  return reversed + [...random].map((b) => b.toString(36).padStart(2, "0")).join("");
}

export function isBuildId(id: string): boolean {
  return /^[0-9a-z]{15}$/.test(id);
}

const keys = (id: string) => ({
  pending: `${PREFIX}${id}/pending.json`,
  meta: `${PREFIX}${id}/meta.json`,
});

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "build";
}

const STRING_FIELDS = [
  "fileName",
  "name",
  "bundleId",
  "version",
  "buildNumber",
  "distribution",
  "profileExpiresAt",
  "profile",
  "channel",
  "gitBranch",
  "gitCommit",
  "notes",
] as const;
const REQUIRED_FIELDS = new Set(["fileName", "name", "bundleId", "version", "buildNumber"]);

export function parseBuildInput(body: unknown): BuildInput {
  if (typeof body !== "object" || body === null) throw new Error("Body must be a JSON object");
  const input = body as Record<string, unknown>;
  if (input.platform !== "ios" && input.platform !== "android") {
    throw new Error('platform must be "ios" or "android"');
  }
  if (typeof input.size !== "number" || !Number.isInteger(input.size) || input.size <= 0) {
    throw new Error("size must be a positive integer");
  }
  const result: Record<string, unknown> = { platform: input.platform, size: input.size };
  for (const field of STRING_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || value === "") {
      if (REQUIRED_FIELDS.has(field)) throw new Error(`${field} is required`);
      continue;
    }
    if (typeof value !== "string") throw new Error(`${field} must be a string`);
    const max = field === "notes" ? 2000 : 200;
    if (value.length > max) throw new Error(`${field} must be at most ${max} characters`);
    result[field] = value;
  }
  return result as unknown as BuildInput;
}

export async function createUpload(input: BuildInput) {
  const s3 = new S3();
  const id = newBuildId();
  const pending: Build = {
    ...input,
    id,
    key: `${PREFIX}${id}/${safeFileName(input.fileName)}`,
    uploadedAt: new Date().toISOString(),
  };
  await s3.putJson(keys(id).pending, pending);
  const uploadUrl = await s3.presign("PUT", pending.key, 60 * 60);
  return { id, uploadUrl };
}

export async function completeUpload(id: string): Promise<Build> {
  const s3 = new S3();
  const pending = await s3.getJson<Build>(keys(id).pending);
  if (!pending) throw new NotFoundError(`No pending upload ${id}`);
  const object = await s3.head(pending.key);
  if (!object) throw new Error("The file has not been uploaded yet");
  if (object.size !== pending.size) {
    throw new Error(`Uploaded size ${object.size} does not match expected ${pending.size}`);
  }
  const build: Build = { ...pending, uploadedAt: new Date().toISOString() };
  await s3.putJson(keys(id).meta, build);
  await s3.delete([keys(id).pending]);
  return build;
}

export async function getBuild(id: string): Promise<Build | null> {
  if (!isBuildId(id)) return null;
  return new S3().getJson<Build>(keys(id).meta);
}

export async function listBuilds(limit = 100): Promise<Build[]> {
  const s3 = new S3();
  const prefixes = await s3.listPrefixes(PREFIX, limit);
  const builds = await Promise.all(prefixes.map((p) => s3.getJson<Build>(`${p}meta.json`)));
  return builds.filter((b): b is Build => b !== null);
}

export async function deleteBuild(id: string): Promise<boolean> {
  const build = await getBuild(id);
  if (!build) return false;
  const s3 = new S3();
  await s3.delete([build.key, keys(id).meta]);
  return true;
}

export class NotFoundError extends Error {}
