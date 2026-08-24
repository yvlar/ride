import type { GenerateRideRequest, GeneratedRideRoute } from "@/domain/ride/types";

export type PersistedRideSession = {
  request: GenerateRideRequest;
  route: GeneratedRideRoute;
  navigating: boolean;
  muted: boolean;
  useKnowledgeRouting: boolean;
  savedAtMs: number;
};

export type RideSessionStore = {
  read(): PersistedRideSession | null;
  write(session: PersistedRideSession): void;
  clear(): void;
};

export const RIDE_SESSION_STORAGE_KEY = "ride.session.v1";

export function parsePersistedRideSession(
  value: unknown,
): PersistedRideSession | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.request !== "object" ||
    record.request === null ||
    typeof record.route !== "object" ||
    record.route === null ||
    typeof record.navigating !== "boolean" ||
    typeof record.savedAtMs !== "number"
  ) {
    return null;
  }
  return {
    request: record.request as GenerateRideRequest,
    route: record.route as GeneratedRideRoute,
    navigating: record.navigating,
    muted: record.muted === true,
    useKnowledgeRouting: record.useKnowledgeRouting === true,
    savedAtMs: record.savedAtMs,
  };
}
