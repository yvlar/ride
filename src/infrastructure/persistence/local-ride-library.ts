import type { Place } from "@/domain/geo/types";
import {
  rememberRecentPlace,
  upsertSavedRide,
  type RideLibrary,
  type SavedRide,
} from "@/domain/library/types";

export const RIDE_LIBRARY_STORAGE_KEY = "ride.library.v1";

type LibrarySnapshot = {
  recents: Place[];
  saved: SavedRide[];
};

function emptySnapshot(): LibrarySnapshot {
  return { recents: [], saved: [] };
}

export function createMemoryRideLibrary(
  initial: LibrarySnapshot = emptySnapshot(),
): RideLibrary {
  let snapshot = {
    recents: [...initial.recents],
    saved: [...initial.saved],
  };

  return {
    listRecents() {
      return snapshot.recents;
    },
    rememberPlace(place) {
      snapshot = {
        ...snapshot,
        recents: rememberRecentPlace(snapshot.recents, place),
      };
    },
    listSaved() {
      return snapshot.saved;
    },
    save(ride) {
      snapshot = {
        ...snapshot,
        saved: upsertSavedRide(snapshot.saved, ride),
      };
    },
    remove(id) {
      snapshot = {
        ...snapshot,
        saved: snapshot.saved.filter((item) => item.id !== id),
      };
    },
    get(id) {
      return snapshot.saved.find((item) => item.id === id) ?? null;
    },
  };
}

export function createLocalRideLibrary(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): RideLibrary {
  const memory = createMemoryRideLibrary(readSnapshot(storage));

  function persist() {
    if (!storage) {
      return;
    }
    try {
      storage.setItem(
        RIDE_LIBRARY_STORAGE_KEY,
        JSON.stringify({
          recents: memory.listRecents(),
          saved: memory.listSaved(),
        }),
      );
    } catch {
      // Quota or private mode: keep the in-memory copy (FR-035).
    }
  }

  return {
    listRecents: () => memory.listRecents(),
    rememberPlace(place) {
      memory.rememberPlace(place);
      persist();
    },
    listSaved: () => memory.listSaved(),
    save(ride) {
      memory.save(ride);
      persist();
    },
    remove(id) {
      memory.remove(id);
      persist();
    },
    get: (id) => memory.get(id),
  };
}

function readSnapshot(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): LibrarySnapshot {
  if (!storage) {
    return emptySnapshot();
  }
  try {
    const raw = storage.getItem(RIDE_LIBRARY_STORAGE_KEY);
    if (!raw) {
      return emptySnapshot();
    }
    const parsed = JSON.parse(raw) as Partial<LibrarySnapshot>;
    return {
      recents: Array.isArray(parsed.recents) ? parsed.recents : [],
      saved: Array.isArray(parsed.saved) ? parsed.saved : [],
    };
  } catch {
    return emptySnapshot();
  }
}
