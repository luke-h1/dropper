import { isApiKey } from '@/lib/auth';
import { listBuilds } from '@/lib/builds';

export async function GET(request: Request) {
  if (!(await isApiKey(request.headers.get('x-api-key')))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return Response.json({ builds: await listBuilds() });
}
