import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { inspectBinary, readProvisioningProfile } from "../cli/inspect";
import { parseXmlPlist } from "../cli/plist";

const fixture = (name: string) => join(import.meta.dir, "fixtures", name);

describe("inspectBinary", () => {
  test("reads an IPA's Info.plist and provisioning profile", () => {
    expect(inspectBinary(fixture("app.ipa"))).toEqual({
      platform: "ios",
      fileName: "app.ipa",
      size: 950,
      name: "Dropper ✈︎",
      bundleId: "com.example.dropper",
      version: "1.2.3",
      buildNumber: "42",
      distribution: "ad-hoc",
      profileExpiresAt: "2027-01-02T03:04:05.000Z",
    });
  });

  test("resolves APK label and version from resources, preferring the default locale", () => {
    expect(inspectBinary(fixture("app.apk"))).toEqual({
      platform: "android",
      fileName: "app.apk",
      size: 1363,
      name: "Dropper Test",
      bundleId: "com.example.dropper",
      version: "1.2.3",
      buildNumber: "42",
    });
  });

  test("rejects other file types", () => {
    expect(() => inspectBinary("build.aab")).toThrow("App bundles");
    expect(() => inspectBinary("build.tar.gz")).toThrow("Expected an .ipa or .apk");
  });
});

const profile = (body: string) =>
  Buffer.from(
    `\x30\x82junk<?xml version="1.0"?><plist version="1.0"><dict>${body}</dict></plist>\x00`,
  );

describe("readProvisioningProfile", () => {
  test("detects distribution type", () => {
    expect(readProvisioningProfile(profile("")).distribution).toBe("app-store");
    expect(
      readProvisioningProfile(profile("<key>ProvisionsAllDevices</key><true/>")).distribution,
    ).toBe("enterprise");
    expect(
      readProvisioningProfile(
        profile(
          "<key>ProvisionedDevices</key><array/><key>Entitlements</key><dict><key>get-task-allow</key><true/></dict>",
        ),
      ).distribution,
    ).toBe("development");
  });

  test("ignores data without a plist", () => {
    expect(readProvisioningProfile(Buffer.from("nope"))).toEqual({});
  });
});

describe("parseXmlPlist", () => {
  test("parses nested values and entities", () => {
    expect(
      parseXmlPlist(`<?xml version="1.0"?><!DOCTYPE plist><plist version="1.0"><dict>
        <key>a &amp; b</key><string>x &lt; y</string>
        <key>n</key><integer>7</integer>
        <key>list</key><array><real>1.5</real><false/><string/></array>
        <key>data</key><data>aGk=</data>
      </dict></plist>`),
    ).toEqual({ "a & b": "x < y", n: 7, list: [1.5, false, ""], data: Buffer.from("hi") });
  });
});
