import { isApiKey } from '@/lib/auth';
import { completeUpload, isBuildId, NotFoundError } from '@/lib/builds';

export async function POST(
  request: Request,
  { params }: RouteContext<'/api/uploads/[id]/complete'>,
) {
  if (!(await isApiKey(request.headers.get('x-api-key')))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  if (!isBuildId(id)) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const build = await completeUpload(id);

    return Response.json({
      build,
      url: new URL(`/b/${id}`, request.url).toString(),
    });
  } catch (error) {
    const status = error instanceof NotFoundError ? 404 : 409;

    const message =
      error instanceof Error ? error.message : 'Upload could not complete';

    return Response.json({ error: message }, { status });
  }
}
