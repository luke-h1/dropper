import { AwsClient } from 'aws4fetch';
import type * as z from 'zod/mini';

import type { Build } from './types';

export class S3 {
  private readonly client: AwsClient;
  private base: string;

  constructor() {
    this.client = new AwsClient({
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      region: process.env.S3_REGION || 'auto',
      service: 's3',
    });
    this.base = `${process.env.S3_ENDPOINT.replace(/\/+$/, '')}/${process.env.S3_BUCKET}`;
  }

  private url(key: string, query: Record<string, string> = {}) {
    const url = new URL(
      `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`,
    );

    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }

    return url;
  }

  async presign(
    method: 'GET' | 'PUT',
    key: string,
    expiresIn: number,
    query: Record<string, string> = {},
  ) {
    const url = this.url(key, { ...query, 'X-Amz-Expires': String(expiresIn) });

    const signed = await this.client.sign(url, {
      method,
      aws: { signQuery: true },
    });

    return signed.url;
  }

  async getJson<T>(key: string, schema: z.ZodMiniType<T>): Promise<T | null> {
    const res = await this.client.fetch(this.url(key));

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`S3 GET ${key} failed: ${res.status}`);
    }

    return schema.parse(await res.json());
  }

  async putJson(key: string, value: Build) {
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body: JSON.stringify(value),
      headers: { 'content-type': 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`S3 PUT ${key} failed: ${res.status}`);
    }
  }

  async head(key: string): Promise<{ size: number } | null> {
    const res = await this.client.fetch(this.url(key), { method: 'HEAD' });

    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`S3 HEAD ${key} failed: ${res.status}`);
    }

    return { size: Number(res.headers.get('content-length') ?? 0) };
  }

  async delete(keys: string[]) {
    await Promise.all(
      keys.map(async key => {
        const res = await this.client.fetch(this.url(key), {
          method: 'DELETE',
        });

        if (!res.ok && res.status !== 404) {
          throw new Error(`S3 DELETE ${key} failed: ${res.status}`);
        }
      }),
    );
  }

  async listPrefixes(prefix: string, maxKeys: number): Promise<string[]> {
    const res = await this.client.fetch(
      this.url('', {
        'list-type': '2',
        prefix,
        delimiter: '/',
        'max-keys': String(maxKeys),
      }),
    );

    if (!res.ok) {
      throw new Error(`S3 LIST ${prefix} failed: ${res.status}`);
    }

    const xml = await res.text();

    return [
      ...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]+)<\/Prefix>/g),
    ].map(m =>
      m[1]!
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&'),
    );
  }
}
