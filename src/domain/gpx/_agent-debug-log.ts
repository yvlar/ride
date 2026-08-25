import { appendFileSync } from "node:fs";

/** Debug-mode NDJSON logger (FR-039). Remove after the investigation. */
export function agentDebugLog(entry: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}): void {
  try {
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      JSON.stringify({ ...entry, timestamp: Date.now() }) + "\n",
    );
  } catch {
    // ignore missing log dir / non-node runtimes
  }
}
