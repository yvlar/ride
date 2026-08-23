import { appendFileSync, readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

const DEBUG_LOG_PATH = "/opt/cursor/logs/debug.log";
const BLOCKED_KEY = /lat|lng|lon|coord|position|heading|speed/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !BLOCKED_KEY.test(key),
    );
    return Object.fromEntries(
      entries.map(([key, nested]) => [key, sanitize(nested)]),
    );
  }
  return value;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const sanitized = sanitize(body);
  try {
    appendFileSync(`${DEBUG_LOG_PATH}`, `${JSON.stringify(sanitized)}\n`);
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function GET(): Promise<Response> {
  try {
    const text = readFileSync(DEBUG_LOG_PATH, "utf8");
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return { message: "unparsed-debug-line" };
        }
      });
    return Response.json({ ok: true, lines });
  } catch {
    return Response.json({ ok: true, lines: [] });
  }
}
