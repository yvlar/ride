import {
  parsePersistedRideSession,
  RIDE_SESSION_STORAGE_KEY,
  type PersistedRideSession,
  type RideSessionStore,
} from "@/domain/ride/session-snapshot";

export function createRideSessionStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): RideSessionStore {
  return {
    read() {
      if (!storage) {
        return null;
      }
      try {
        const raw = storage.getItem(RIDE_SESSION_STORAGE_KEY);
        if (!raw) {
          return null;
        }
        return parsePersistedRideSession(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    },
    write(session: PersistedRideSession) {
      if (!storage) {
        return;
      }
      try {
        storage.setItem(RIDE_SESSION_STORAGE_KEY, JSON.stringify(session));
      } catch {
        // Ignore quota / private mode.
      }
    },
    clear() {
      storage?.removeItem(RIDE_SESSION_STORAGE_KEY);
    },
  };
}
