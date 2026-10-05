// An in-memory stand-in for S3 that understands just the calls Dropper makes.
// Run directly (bun test/fake-s3.ts) to point a local dev server at it.
export function startFakeS3(port = 0, bucket = 'test-bucket') {
  const objects = new Map<string, ArrayBuffer>();

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const [, bucketName, ...rest] = url.pathname.split('/');

      if (bucketName !== bucket) {
        return new Response('NoSuchBucket', { status: 404 });
      }

      const key = rest.map(decodeURIComponent).join('/');

      if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix') ?? '';
        const max = Number(url.searchParams.get('max-keys') ?? 1000);

        const prefixes = [
          ...new Set(
            [...objects.keys()].flatMap(k =>
              k.startsWith(prefix)
                ? [prefix + k.slice(prefix.length).split('/')[0] + '/']
                : [],
            ),
          ),
        ]
          .toSorted()
          .slice(0, max);

        return new Response(
          `<ListBucketResult>${prefixes.map(p => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`).join('')}</ListBucketResult>`,
        );
      }

      const object = objects.get(key);

      switch (req.method) {
        case 'PUT':
          objects.set(key, await req.arrayBuffer());

          return new Response(null);
        case 'GET':
          return object
            ? new Response(object)
            : new Response('NoSuchKey', { status: 404 });
        case 'HEAD':
          return object
            ? new Response(null, {
                headers: { 'content-length': String(object.byteLength) },
              })
            : new Response(null, { status: 404 });
        case 'DELETE':
          objects.delete(key);

          return new Response(null, { status: 204 });
      }

      return new Response('Bad method', { status: 405 });
    },
  });

  return { server, objects };
}

if (import.meta.main) {
  const { server } = startFakeS3(
    Number(process.env.PORT ?? 9000),
    process.env.BUCKET ?? 'dropper',
  );

  console.log(`Fake S3 listening on ${server.url.origin}`);
}
