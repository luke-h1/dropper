import { hasApiKey, json } from "@/lib/auth";
import { deleteBuild } from "@/lib/builds";

export async function DELETE(request: Request, { params }: RouteContext<"/api/builds/[id]">) {
  if (!(await hasApiKey(request))) return json({ error: "Unauthorized" }, 401);
  const { id } = await params;
  if (!(await deleteBuild(id))) return json({ error: "Not found" }, 404);
  return json({ deleted: id });
}
