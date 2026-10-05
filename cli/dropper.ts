import { execFileSync } from 'node:child_process';
import { openAsBlob } from 'node:fs';
import { parseArgs } from 'node:util';

import { renderUnicodeCompact } from 'uqr';
import * as z from 'zod/mini';

import { formatBytes } from '../src/lib/format';
import { Build, type BuildInput } from '../src/lib/types';
import { inspectBinary } from './inspect';

const HELP = `dropper - upload IPA/APK builds to your Dropper site

Usage:
  dropper upload <file.ipa|file.apk> [options]
  dropper list
  dropper delete <id>

Upload options:
  --profile <name>   EAS build profile, e.g. development
  --channel <name>   EAS Update channel
  --notes <text>     Release notes shown on the build page
  --name <name>      Override the app name read from the binary
  --no-git           Don't record the current git branch and commit
  --no-qr            Don't print a QR code after uploading

Environment:
  DROPPER_URL        Your Dropper site, e.g. https://dropper.example.com
  DROPPER_API_KEY    The API_KEY configured on the site
`;

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function config() {
  const url = process.env.DROPPER_URL?.replace(/\/+$/, '');
  const key = process.env.DROPPER_API_KEY;

  if (!url || !key) {
    fail('DROPPER_URL and DROPPER_API_KEY must be set');
  }

  return { url, key };
}

const ApiError = z.object({ error: z.string() });

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  allowNegative: true,
  options: {
    profile: { type: 'string' },
    channel: { type: 'string' },
    notes: { type: 'string' },
    name: { type: 'string' },
    git: { type: 'boolean' },
    qr: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

async function api<T>(
  path: string,
  schema: z.ZodMiniType<T>,
  init: RequestInit = {},
): Promise<T> {
  const { url, key } = config();

  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      'x-api-key': key,
      'content-type': 'application/json',
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    fail(
      ApiError.safeParse(body).data?.error ??
        `${init.method ?? 'GET'} ${path} failed with ${res.status}`,
    );
  }

  return schema.parse(body);
}

function git(...args: string[]): string | undefined {
  try {
    return (
      execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

async function upload(file: string) {
  let info;

  try {
    info = inspectBinary(file);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const input: BuildInput = {
    ...info,
    name: options.name ?? info.name,
    profile: options.profile,
    channel: options.channel,
    notes: options.notes,
  };

  if (options.git !== false) {
    input.gitBranch = git('rev-parse', '--abbrev-ref', 'HEAD');
    input.gitCommit = git('rev-parse', 'HEAD');
  }

  console.log(
    `${input.name} ${input.version} (${input.buildNumber}) · ${input.bundleId}`,
  );

  if (input.distribution === 'app-store') {
    console.warn(
      'warning: this IPA is signed for App Store distribution and cannot be installed from Dropper. Use an EAS profile with "distribution": "internal".',
    );
  }

  const { id, uploadUrl } = await api(
    '/api/uploads',
    z.object({ id: z.string(), uploadUrl: z.string() }),
    { method: 'POST', body: JSON.stringify(input) },
  );

  console.log(`Uploading ${formatBytes(input.size)}...`);
  const started = Date.now();

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: await openAsBlob(file),
  });

  if (!res.ok) {
    fail(`Upload to storage failed with ${res.status}: ${await res.text()}`);
  }

  const seconds = (Date.now() - started) / 1000;
  console.log(`Uploaded in ${seconds.toFixed(1)}s`);

  const { url } = await api(
    `/api/uploads/${id}/complete`,
    z.object({ url: z.string() }),
    { method: 'POST' },
  );

  console.log(`\n${url}\n`);
  const phoneUrl = `${url}?key=${encodeURIComponent(config().key)}`;

  if (options.qr !== false) {
    console.log(renderUnicodeCompact(phoneUrl));
  }
}

async function list() {
  const { builds } = await api(
    '/api/builds',
    z.object({ builds: z.array(Build) }),
  );

  for (const b of builds) {
    const platform = b.platform === 'ios' ? 'iOS    ' : 'Android';
    console.log(
      `${b.id}  ${platform}  ${b.name} ${b.version} (${b.buildNumber})  ${b.profile ?? ''}  ${b.uploadedAt}`,
    );
  }

  if (builds.length === 0) {
    console.log('No builds yet');
  }
}

async function main() {
  const [command, arg] = positionals;

  if (options.help || !command) {
    console.log(HELP);

    return;
  }

  switch (command) {
    case 'upload':
      if (!arg) {
        fail('Usage: dropper upload <file.ipa|file.apk>');
      }

      return upload(arg);
    case 'list':
      return list();
    case 'delete':
      if (!arg) {
        fail('Usage: dropper delete <id>');
      }

      await api(
        `/api/builds/${encodeURIComponent(arg)}`,
        z.object({ deleted: z.string() }),
        { method: 'DELETE' },
      );
      console.log(`Deleted ${arg}`);

      return;
    default:
      fail(`Unknown command ${command}\n\n${HELP}`);
  }
}

await main();
