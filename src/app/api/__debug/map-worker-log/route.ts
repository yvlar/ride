import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const LOG_PATH = "/opt/cursor/logs/debug.log";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    ...body,
  };
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  return Response.json({ ok: true });
}
