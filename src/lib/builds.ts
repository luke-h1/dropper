import { S3 } from './s3';
import { Build, type BuildInput } from './types';

const PREFIX = 'builds/';

const MAX_TIME = 10 ** 13;

export function newBuildId(now = Date.now()): string {
  const reversed = (MAX_TIME - now).toString(36).padStart(9, '0');
  const random = crypto.getRandomValues(new Uint8Array(3));

  return (
    reversed + [...random].map(b => b.toString(36).padStart(2, '0')).join('')
  );
}

export function isBuildId(id: string): boolean {
  return /^[0-9a-z]{15}$/.test(id);
}

export async function createUpload(input: BuildInput) {
  const s3 = new S3();
  const id = newBuildId();

  const pending: Build = {
    ...input,
    id,
    key: `${PREFIX}${id}/${input.fileName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'build'}`,
    uploadedAt: new Date().toISOString(),
  };

  await s3.putJson(`${PREFIX}${id}/pending.json`, pending);
  const uploadUrl = await s3.presign('PUT', pending.key, 60 * 60);

  return { id, uploadUrl };
}

export async function completeUpload(id: string): Promise<Build> {
  const s3 = new S3();
  const pending = await s3.getJson(`${PREFIX}${id}/pending.json`, Build);

  if (!pending) {
    throw new NotFoundError(`No pending upload ${id}`);
  }

  const object = await s3.head(pending.key);

  if (!object) {
    throw new Error('The file has not been uploaded yet');
  }

  if (object.size !== pending.size) {
    throw new Error(
      `Uploaded size ${object.size} does not match expected ${pending.size}`,
    );
  }

  const build: Build = { ...pending, uploadedAt: new Date().toISOString() };

  await s3.putJson(`${PREFIX}${id}/meta.json`, build);
  await s3.delete([`${PREFIX}${id}/pending.json`]);

  return build;
}

export async function getBuild(id: string): Promise<Build | null> {
  if (!isBuildId(id)) {
    return null;
  }

  return new S3().getJson(`${PREFIX}${id}/meta.json`, Build);
}

export async function listBuilds(limit = 100): Promise<Build[]> {
  const s3 = new S3();
  const prefixes = await s3.listPrefixes(PREFIX, limit);

  const builds = await Promise.all(
    prefixes.map(p => s3.getJson(`${p}meta.json`, Build)),
  );

  return builds.filter((b): b is Build => b !== null);
}

export async function deleteBuild(id: string): Promise<boolean> {
  const build = await getBuild(id);

  if (!build) {
    return false;
  }

  await new S3().delete([build.key, `${PREFIX}${id}/meta.json`]);

  return true;
}

export class NotFoundError extends Error {}
