import { hasApiKey, json } from "@/lib/auth";
import { completeUpload, isBuildId, NotFoundError } from "@/lib/builds";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/uploads/[id]/complete">,
) {
  if (!(await hasApiKey(request))) return json({ error: "Unauthorized" }, 401);
  const { id } = await params;
  if (!isBuildId(id)) return json({ error: "Not found" }, 404);
  try {
    const build = await completeUpload(id);
    return json({ build, url: new URL(`/b/${id}`, request.url).toString() });
  } catch (error) {
    const status = error instanceof NotFoundError ? 404 : 409;
    return json({ error: (error as Error).message }, status);
  }
}
