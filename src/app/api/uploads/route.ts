import { hasApiKey, json } from "@/lib/auth";
import { createUpload, parseBuildInput } from "@/lib/builds";

export async function POST(request: Request) {
  if (!(await hasApiKey(request))) return json({ error: "Unauthorized" }, 401);
  let input;
  try {
    input = parseBuildInput(await request.json());
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }
  return json(await createUpload(input), 201);
}
