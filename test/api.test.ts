import { afterAll, beforeAll, expect, test } from "bun:test";

import { startFakeS3 } from "./fake-s3";

let fake: ReturnType<typeof startFakeS3>;

beforeAll(() => {
  fake = startFakeS3();
  Object.assign(process.env, {
    S3_ENDPOINT: fake.server.url.origin,
    S3_REGION: "auto",
    S3_BUCKET: "test-bucket",
    S3_ACCESS_KEY_ID: "key",
    S3_SECRET_ACCESS_KEY: "secret",
    API_KEY: "api-key",
  });
});

afterAll(() => fake.server.stop(true));

const auth = { "x-api-key": "api-key" };
const params = <T>(value: T) => ({ params: Promise.resolve(value) });

test("upload, list, install manifest and delete", async () => {
  const uploads = await import("../src/app/api/uploads/route");
  const complete = await import("../src/app/api/uploads/[id]/complete/route");
  const builds = await import("../src/app/api/builds/route");
  const build = await import("../src/app/api/builds/[id]/route");
  const manifest =
    await import("../src/app/api/builds/[id]/manifest/[exp]/[sig]/manifest.plist/route");
  const { signInstallLink } = await import("../src/lib/crypto");

  const input = {
    platform: "ios",
    fileName: "My App.ipa",
    size: 5,
    name: "My App",
    bundleId: "com.example.app",
    version: "1.0",
    buildNumber: "7",
  };

  const unauthorized = await uploads.POST(
    new Request("https://dropper.test/api/uploads", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  expect(unauthorized.status).toBe(401);

  const created = await uploads.POST(
    new Request("https://dropper.test/api/uploads", {
      method: "POST",
      headers: auth,
      body: JSON.stringify(input),
    }),
  );
  expect(created.status).toBe(201);
  const { id, uploadUrl } = (await created.json()) as { id: string; uploadUrl: string };
  expect(uploadUrl).toContain("X-Amz-Signature=");
  expect(uploadUrl).toContain(`/test-bucket/builds/${id}/My-App.ipa`);

  const completeRequest = () =>
    complete.POST(
      new Request(`https://dropper.test/api/uploads/${id}/complete`, {
        method: "POST",
        headers: auth,
      }),
      params({ id }),
    );
  expect((await completeRequest()).status).toBe(409);

  expect((await fetch(uploadUrl, { method: "PUT", body: "hello" })).ok).toBe(true);
  const completed = await completeRequest();
  expect(completed.status).toBe(200);
  expect(((await completed.json()) as { url: string }).url).toBe(`https://dropper.test/b/${id}`);

  const listed = await builds.GET(
    new Request("https://dropper.test/api/builds", { headers: auth }),
  );
  const { builds: all } = (await listed.json()) as { builds: { id: string; name: string }[] };
  expect(all.map((b) => [b.id, b.name])).toEqual([[id, "My App"]]);

  const { exp, sig } = await signInstallLink("api-key", id, 60);
  const plist = await manifest.GET(
    new Request("https://dropper.test"),
    params({ id, exp: String(exp), sig }),
  );
  expect(plist.status).toBe(200);
  expect(await plist.text()).toContain("<string>com.example.app</string>");
  const forged = await manifest.GET(
    new Request("https://dropper.test"),
    params({ id, exp: String(exp), sig: "x" }),
  );
  expect(forged.status).toBe(403);

  const deleted = await build.DELETE(
    new Request(`https://dropper.test/api/builds/${id}`, { method: "DELETE", headers: auth }),
    params({ id }),
  );
  expect(deleted.status).toBe(200);
  expect([...fake.objects.keys()]).toEqual([]);
});
