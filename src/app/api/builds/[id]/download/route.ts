import { hasSession, isApiKey } from '@/lib/auth';
import { getBuild } from '@/lib/builds';
import { S3 } from '@/lib/s3';

export async function GET(
  request: Request,
  { params }: RouteContext<'/api/builds/[id]/download'>,
) {
  if (
    !(await hasSession()) &&
    !(await isApiKey(request.headers.get('x-api-key')))
  ) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const build = await getBuild(id);

  if (!build) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const fileName = build.key.slice(build.key.lastIndexOf('/') + 1);

  const url = await new S3().presign('GET', build.key, 5 * 60, {
    'response-content-disposition': `attachment; filename="${fileName}"`,
    'response-content-type':
      build.platform === 'android'
        ? 'application/vnd.android.package-archive'
        : 'application/octet-stream',
  });

  return Response.redirect(url, 302);
}
