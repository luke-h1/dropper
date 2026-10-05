import { AwsClient } from "aws4fetch";
import { getEnv } from "./env";

export class S3 {
  private client: AwsClient;
  private base: string;

  constructor() {
    const env = getEnv();
    this.client = new AwsClient({
      accessKeyId: env.s3AccessKeyId,
      secretAccessKey: env.s3SecretAccessKey,
      region: env.s3Region,
      service: "s3",
    });
    // Path-style addressing works with R2, AWS S3, MinIO and most other providers.
    this.base = `${env.s3Endpoint}/${env.s3Bucket}`;
  }

  private url(key: string, query: Record<string, string> = {}) {
    const url = new URL(`${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url;
  }

  async presign(
    method: "GET" | "PUT",
    key: string,
    expiresIn: number,
    query: Record<string, string> = {},
  ) {
    const url = this.url(key, { ...query, "X-Amz-Expires": String(expiresIn) });
    const signed = await this.client.sign(url, { method, aws: { signQuery: true } });
    return signed.url;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const res = await this.client.fetch(this.url(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 GET ${key} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  async putJson(key: string, value: unknown) {
    const res = await this.client.fetch(this.url(key), {
      method: "PUT",
      body: JSON.stringify(value),
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`S3 PUT ${key} failed: ${res.status}`);
  }

  async head(key: string): Promise<{ size: number } | null> {
    const res = await this.client.fetch(this.url(key), { method: "HEAD" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S3 HEAD ${key} failed: ${res.status}`);
    return { size: Number(res.headers.get("content-length") ?? 0) };
  }

  async delete(keys: string[]) {
    await Promise.all(
      keys.map(async (key) => {
        const res = await this.client.fetch(this.url(key), { method: "DELETE" });
        if (!res.ok && res.status !== 404)
          throw new Error(`S3 DELETE ${key} failed: ${res.status}`);
      }),
    );
  }

  /** Lists the "folders" directly under a prefix, in lexicographic order. */
  async listPrefixes(prefix: string, maxKeys: number): Promise<string[]> {
    const res = await this.client.fetch(
      this.url("", {
        "list-type": "2",
        prefix,
        delimiter: "/",
        "max-keys": String(maxKeys),
      }),
    );
    if (!res.ok) throw new Error(`S3 LIST ${prefix} failed: ${res.status}`);
    const xml = await res.text();
    return [...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]+)<\/Prefix>/g)].map((m) =>
      decodeXml(m[1]!),
    );
  }
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
