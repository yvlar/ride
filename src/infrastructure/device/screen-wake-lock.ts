import { KeepAwake } from "@capacitor-community/keep-awake";
import { isNativeCapacitorPlatform } from "@/infrastructure/native/platform";

export type ScreenWakeLock = {
  acquire: () => void;
  release: () => void;
};

export type KeepAwakePlugin = {
  keepAwake: () => Promise<void>;
  allowSleep: () => Promise<void>;
};

export function createNoopScreenWakeLock(): ScreenWakeLock {
  return {
    acquire() {},
    release() {},
  };
}

export function createPluginScreenWakeLock(
  plugin: KeepAwakePlugin,
): ScreenWakeLock {
  let held = false;
  return {
    acquire() {
      if (held) {
        return;
      }
      held = true;
      void plugin.keepAwake().catch(() => {
        held = false;
      });
    },
    release() {
      if (!held) {
        return;
      }
      held = false;
      void plugin.allowSleep().catch(() => {
        // NFR-006: releasing the lock must not throw into navigation teardown.
      });
    },
  };
}

export type ForegroundScreenWakeLockDeps = {
  isNative?: boolean;
  plugin?: KeepAwakePlugin;
};

/**
 * Keeps the screen on only inside the native iOS shell during FR-023.
 * Safari / desktop stay no-op (NFR-007).
 */
export function createForegroundScreenWakeLock(
  deps: ForegroundScreenWakeLockDeps = {},
): ScreenWakeLock {
  const native = deps.isNative ?? isNativeCapacitorPlatform();
  if (!native) {
    return createNoopScreenWakeLock();
  }
  return createPluginScreenWakeLock(deps.plugin ?? defaultKeepAwakePlugin());
}

export function defaultKeepAwakePlugin(): KeepAwakePlugin {
  return {
    keepAwake: () => KeepAwake.keepAwake(),
    allowSleep: () => KeepAwake.allowSleep(),
  };
}