import { hasApiKey, json } from "@/lib/auth";
import { listBuilds } from "@/lib/builds";

export async function GET(request: Request) {
  if (!(await hasApiKey(request))) return json({ error: "Unauthorized" }, 401);
  return json({ builds: await listBuilds() });
}
