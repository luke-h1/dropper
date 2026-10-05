import { describe, expect, test } from 'bun:test';

import { isBuildId, newBuildId } from '../src/lib/builds';
import { signInstallLink, verifyInstallLink } from '../src/lib/crypto';
import { formatBytes, formatRelative } from '../src/lib/format';
import { installManifest } from '../src/lib/manifest';
import { BuildInput } from '../src/lib/types';

describe('build ids', () => {
  test('newer builds sort first', () => {
    const older = newBuildId(1_700_000_000_000);
    const newer = newBuildId(1_700_000_000_001);
    expect(isBuildId(older)).toBe(true);
    expect([older, newer].toSorted()).toEqual([newer, older]);
  });

  test("rejects anything that isn't an id", () => {
    expect(isBuildId('../meta')).toBe(false);
    expect(isBuildId('')).toBe(false);
  });
});

describe('BuildInput', () => {
  const valid = {
    platform: 'ios',
    fileName: 'a.ipa',
    size: 10,
    name: 'App',
    bundleId: 'com.example',
    version: '1.0',
    buildNumber: '1',
  };

  test('keeps known fields and drops unknown ones', () => {
    expect(
      BuildInput.parse({
        ...valid,
        profile: 'dev',
        extra: 'x',
        notes: '',
        gitBranch: null,
      }),
    ).toEqual({
      ...valid,
      platform: 'ios',
      profile: 'dev',
    });
  });

  test.each([
    [{ ...valid, platform: 'windows' }, 'platform'],
    [{ ...valid, size: -1 }, 'size'],
    [{ ...valid, bundleId: '' }, 'bundleId'],
    [{ ...valid, name: 3 }, 'name'],
    [{ ...valid, notes: 'x'.repeat(2001) }, 'notes'],
  ])('rejects invalid input %#', (input, path) => {
    expect(BuildInput.safeParse(input).error?.issues[0]?.path).toEqual([path]);
  });
});

describe('install links', () => {
  const secret = 's3cret';
  const now = 1_700_000_000_000;

  test('verify while valid', async () => {
    const { exp, sig } = await signInstallLink(secret, 'abc', 60, now);
    expect(await verifyInstallLink(secret, 'abc', exp, sig, now)).toBe(true);
  });

  test('reject expired, tampered or foreign links', async () => {
    const { exp, sig } = await signInstallLink(secret, 'abc', 60, now);
    expect(await verifyInstallLink(secret, 'abc', exp, sig, now + 61_000)).toBe(
      false,
    );
    expect(await verifyInstallLink(secret, 'abc', exp + 1, sig, now)).toBe(
      false,
    );
    expect(await verifyInstallLink(secret, 'xyz', exp, sig, now)).toBe(false);
    expect(await verifyInstallLink('other', 'abc', exp, sig, now)).toBe(false);
    expect(await verifyInstallLink(secret, 'abc', Number.NaN, sig, now)).toBe(
      false,
    );
  });
});

test('installManifest escapes values', () => {
  const xml = installManifest(
    {
      bundleId: 'com.example',
      version: '1.0',
      name: 'Tom & Jerry <dev>',
    },
    'https://s3.example.com/a.ipa?X-Amz-Signature=1&b=2',
  );

  expect(xml).toContain('<string>Tom &amp; Jerry &lt;dev&gt;</string>');
  expect(xml).toContain('a.ipa?X-Amz-Signature=1&amp;b=2');
});

test('formatting', () => {
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
  const now = Date.parse('2026-01-01T12:00:00Z');
  expect(formatRelative('2026-01-01T11:59:50Z', now)).toBe('just now');
  expect(formatRelative('2026-01-01T10:00:00Z', now)).toBe('2 hours ago');
});
