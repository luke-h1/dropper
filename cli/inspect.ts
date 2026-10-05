import { basename, extname } from "node:path";
import type { BuildInput } from "../src/lib/types";
import { parseManifest, ResourceTable, type ResValue } from "./android";
import { parsePlist, parseXmlPlist, type PlistValue } from "./plist";
import { ZipReader } from "./zip";

export type BinaryInfo = Pick<
  BuildInput,
  | "platform"
  | "fileName"
  | "size"
  | "name"
  | "bundleId"
  | "version"
  | "buildNumber"
  | "distribution"
  | "profileExpiresAt"
>;

type Dict = Record<string, PlistValue>;

const asDict = (value: PlistValue | undefined): Dict =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value)
    ? (value as Dict)
    : {};

const asString = (value: PlistValue | ResValue | undefined): string | undefined =>
  typeof value === "string" || typeof value === "number" ? String(value) : undefined;

export function inspectBinary(path: string): BinaryInfo {
  const ext = extname(path).toLowerCase();
  if (ext === ".aab")
    throw new Error("App bundles (.aab) can't be installed directly, build an APK instead");
  if (ext !== ".ipa" && ext !== ".apk")
    throw new Error(`Expected an .ipa or .apk file, got ${basename(path)}`);
  const zip = new ZipReader(path);
  try {
    return ext === ".ipa" ? inspectIpa(zip, path) : inspectApk(zip, path);
  } finally {
    zip.close();
  }
}

function inspectIpa(zip: ZipReader, path: string): BinaryInfo {
  const infoEntry = zip.find(/^Payload\/[^/]+\.app\/Info\.plist$/);
  if (!infoEntry) throw new Error("No Payload/*.app/Info.plist found, is this an IPA?");
  const info = asDict(parsePlist(zip.read(infoEntry)));
  const bundleId = asString(info.CFBundleIdentifier);
  if (!bundleId) throw new Error("Info.plist has no CFBundleIdentifier");

  const appDir = infoEntry.name.slice(0, -"Info.plist".length);
  const profileEntry = zip.entries.find((e) => e.name === `${appDir}embedded.mobileprovision`);
  const profile = profileEntry ? readProvisioningProfile(zip.read(profileEntry)) : {};

  return {
    platform: "ios",
    fileName: basename(path),
    size: zip.fileSize,
    name: asString(info.CFBundleDisplayName) ?? asString(info.CFBundleName) ?? bundleId,
    bundleId,
    version: asString(info.CFBundleShortVersionString) ?? "0",
    buildNumber: asString(info.CFBundleVersion) ?? "0",
    ...profile,
  };
}

/** The profile is a CMS-signed blob with an XML plist inside; we only need the plist. */
export function readProvisioningProfile(
  data: Buffer,
): Pick<BinaryInfo, "distribution" | "profileExpiresAt"> {
  const start = data.indexOf("<?xml");
  const end = data.indexOf("</plist>");
  if (start === -1 || end === -1) return {};
  const profile = asDict(parseXmlPlist(data.toString("utf8", start, end + "</plist>".length)));
  const entitlements = asDict(profile.Entitlements);
  let distribution = "app-store";
  if (profile.ProvisionsAllDevices === true) distribution = "enterprise";
  else if (Array.isArray(profile.ProvisionedDevices)) {
    distribution = entitlements["get-task-allow"] === true ? "development" : "ad-hoc";
  }
  const expires = profile.ExpirationDate;
  return {
    distribution,
    profileExpiresAt: expires instanceof Date ? expires.toISOString() : undefined,
  };
}

function inspectApk(zip: ZipReader, path: string): BinaryInfo {
  const manifestEntry = zip.find(/^AndroidManifest\.xml$/);
  if (!manifestEntry) {
    if (zip.find(/^base\/manifest\/AndroidManifest\.xml$/)) {
      throw new Error('This is an app bundle (.aab), set "buildType": "apk" in your EAS profile');
    }
    throw new Error("No AndroidManifest.xml found, is this an APK?");
  }
  const manifest = parseManifest(zip.read(manifestEntry));
  if (!manifest.package) throw new Error("AndroidManifest.xml has no package name");

  let label = asString(manifest.label);
  let versionName = asString(manifest.versionName);
  const needsResources =
    typeof manifest.label === "object" || typeof manifest.versionName === "object";
  const arsc = needsResources ? zip.find(/^resources\.arsc$/) : undefined;
  if (arsc) {
    const table = new ResourceTable(zip.read(arsc));
    label ??= asString(table.resolve(manifest.label));
    versionName ??= asString(table.resolve(manifest.versionName));
  }

  return {
    platform: "android",
    fileName: basename(path),
    size: zip.fileSize,
    name: label ?? manifest.package,
    bundleId: manifest.package,
    version: versionName ?? "0",
    buildNumber: asString(manifest.versionCode) ?? "0",
  };
}
