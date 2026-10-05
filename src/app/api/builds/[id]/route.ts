import { isApiKey } from '@/lib/auth';
import { deleteBuild } from '@/lib/builds';

export async function DELETE(
  request: Request,
  { params }: RouteContext<'/api/builds/[id]'>,
) {
  if (!(await isApiKey(request.headers.get('x-api-key')))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  if (!(await deleteBuild(id))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({ deleted: id });
}
