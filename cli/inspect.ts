import { basename, extname } from 'node:path';

import * as z from 'zod/mini';

import type { BuildInput } from '../src/lib/types';
import { isRef, parseManifest, ResourceTable, type ResValue } from './android';
import { parsePlist, parseXmlPlist } from './plist';
import { ZipReader } from './zip';

export type BinaryInfo = Pick<
  BuildInput,
  | 'platform'
  | 'fileName'
  | 'size'
  | 'name'
  | 'bundleId'
  | 'version'
  | 'buildNumber'
  | 'distribution'
  | 'profileExpiresAt'
>;

const Text = z.pipe(z.union([z.string(), z.number()]), z.transform(String));

const OptionalText = z.catch(z.optional(Text), undefined);

const InfoPlist = z.object({
  CFBundleIdentifier: OptionalText,
  CFBundleDisplayName: OptionalText,
  CFBundleName: OptionalText,
  CFBundleShortVersionString: OptionalText,
  CFBundleVersion: OptionalText,
});

const ProvisioningProfile = z.catch(
  z.object({
    ProvisionsAllDevices: z.catch(z.optional(z.boolean()), undefined),
    ProvisionedDevices: z.catch(z.optional(z.array(z.string())), undefined),
    Entitlements: z.catch(
      z.object({
        'get-task-allow': z.catch(z.optional(z.boolean()), undefined),
      }),
      {},
    ),
    ExpirationDate: z.catch(z.optional(z.date()), undefined),
  }),
  { Entitlements: {} },
);

function text(value: ResValue | undefined): string | undefined {
  return Text.safeParse(value).data;
}

export function inspectBinary(path: string): BinaryInfo {
  const ext = extname(path).toLowerCase();

  if (ext === '.aab') {
    throw new Error(
      "App bundles (.aab) can't be installed directly, build an APK instead",
    );
  }

  if (ext !== '.ipa' && ext !== '.apk') {
    throw new Error(`Expected an .ipa or .apk file, got ${basename(path)}`);
  }

  const zip = new ZipReader(path);

  try {
    return ext === '.ipa' ? inspectIpa(zip, path) : inspectApk(zip, path);
  } finally {
    zip.close();
  }
}

function inspectIpa(zip: ZipReader, path: string): BinaryInfo {
  const infoEntry = zip.find(/^Payload\/[^/]+\.app\/Info\.plist$/);

  if (!infoEntry) {
    throw new Error('No Payload/*.app/Info.plist found, is this an IPA?');
  }

  const info = InfoPlist.parse(parsePlist(zip.read(infoEntry)));
  const bundleId = info.CFBundleIdentifier;

  if (!bundleId) {
    throw new Error('Info.plist has no CFBundleIdentifier');
  }

  const appDir = infoEntry.name.slice(0, -'Info.plist'.length);

  const profileEntry = zip.entries.find(
    (e) => e.name === `${appDir}embedded.mobileprovision`,
  );

  const profile = profileEntry
    ? readProvisioningProfile(zip.read(profileEntry))
    : {};

  return {
    platform: 'ios',
    fileName: basename(path),
    size: zip.fileSize,
    name: info.CFBundleDisplayName ?? info.CFBundleName ?? bundleId,
    bundleId,
    version: info.CFBundleShortVersionString ?? '0',
    buildNumber: info.CFBundleVersion ?? '0',
    ...profile,
  };
}

export function readProvisioningProfile(
  data: Buffer,
): Pick<BinaryInfo, 'distribution' | 'profileExpiresAt'> {
  const start = data.indexOf('<?xml');
  const end = data.indexOf('</plist>');

  if (start === -1 || end === -1) {
    return {};
  }

  const profile = ProvisioningProfile.parse(
    parseXmlPlist(data.toString('utf8', start, end + '</plist>'.length)),
  );

  let distribution = 'app-store';

  if (profile.ProvisionsAllDevices === true) {
    distribution = 'enterprise';
  } else if (profile.ProvisionedDevices) {
    distribution =
      profile.Entitlements['get-task-allow'] === true
        ? 'development'
        : 'ad-hoc';
  }

  const expires = profile.ExpirationDate;

  return {
    distribution,
    profileExpiresAt: expires?.toISOString(),
  };
}

function inspectApk(zip: ZipReader, path: string): BinaryInfo {
  const manifestEntry = zip.find(/^AndroidManifest\.xml$/);

  if (!manifestEntry) {
    if (zip.find(/^base\/manifest\/AndroidManifest\.xml$/)) {
      throw new Error(
        'This is an app bundle (.aab), set "buildType": "apk" in your EAS profile',
      );
    }

    throw new Error('No AndroidManifest.xml found, is this an APK?');
  }

  const manifest = parseManifest(zip.read(manifestEntry));

  if (!manifest.package) {
    throw new Error('AndroidManifest.xml has no package name');
  }

  let label = text(manifest.label);
  let versionName = text(manifest.versionName);

  const needsResources = isRef(manifest.label) || isRef(manifest.versionName);

  const arsc = needsResources ? zip.find(/^resources\.arsc$/) : undefined;

  if (arsc) {
    const table = new ResourceTable(zip.read(arsc));
    label ??= text(table.resolve(manifest.label));
    versionName ??= text(table.resolve(manifest.versionName));
  }

  return {
    platform: 'android',
    fileName: basename(path),
    size: zip.fileSize,
    name: label ?? manifest.package,
    bundleId: manifest.package,
    version: versionName ?? '0',
    buildNumber: text(manifest.versionCode) ?? '0',
  };
}
