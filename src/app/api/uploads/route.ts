import * as z from 'zod/mini';

import { isApiKey } from '@/lib/auth';
import { createUpload } from '@/lib/builds';
import { BuildInput } from '@/lib/types';

export async function POST(request: Request) {
  if (!(await isApiKey(request.headers.get('x-api-key')))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const input = BuildInput.safeParse(await request.json().catch(() => null));

  if (!input.success) {
    return Response.json(
      { error: z.prettifyError(input.error) },
      { status: 400 },
    );
  }

  return Response.json(await createUpload(input.data), { status: 201 });
}
