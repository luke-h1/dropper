import { getBuild } from '@/lib/builds';
import { verifyInstallLink } from '@/lib/crypto';
import { installManifest } from '@/lib/manifest';
import { S3 } from '@/lib/s3';

export async function GET(
  _request: Request,
  {
    params,
  }: RouteContext<'/api/builds/[id]/manifest/[exp]/[sig]/manifest.plist'>,
) {
  const { id, exp, sig } = await params;

  if (!(await verifyInstallLink(process.env.API_KEY, id, Number(exp), sig))) {
    return new Response('Link expired, reload the build page', { status: 403 });
  }

  const build = await getBuild(id);

  if (!build || build.platform !== 'ios') {
    return new Response('Not found', { status: 404 });
  }

  const ipaUrl = await new S3().presign('GET', build.key, 60 * 60);

  return new Response(installManifest(build, ipaUrl), {
    headers: { 'content-type': 'application/xml', 'cache-control': 'no-store' },
  });
}
