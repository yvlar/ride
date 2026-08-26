import { describe, expect, it, vi } from "vitest";
import {
  createLongPressRecognizer,
  LONG_PRESS_DELAY_MS,
} from "./long-press";

/** Drives the recognizer without real timers. */
function fakeClock() {
  const pending = new Map<number, () => void>();
  let nextHandle = 1;
  return {
    setTimer: (callback: () => void) => {
      const handle = nextHandle++;
      pending.set(handle, callback);
      return handle;
    },
    clearTimer: (handle: number) => {
      pending.delete(handle);
    },
    fireAll: () => {
      for (const callback of [...pending.values()]) {
        callback();
      }
      pending.clear();
    },
    size: () => pending.size,
  };
}

describe("long press recognizer (FR-038)", () => {
  it("reports a press held past the delay", () => {
    const clock = fakeClock();
    const onLongPress = vi.fn();
    const recognizer = createLongPressRecognizer({
      onLongPress,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    recognizer.start({ x: 100, y: 200 });
    expect(recognizer.pending()).toBe(true);
    clock.fireAll();

    expect(onLongPress).toHaveBeenCalledWith({ x: 100, y: 200 });
    expect(recognizer.pending()).toBe(false);
  });

  it("cancels when the finger pans the map", () => {
    const clock = fakeClock();
    const onLongPress = vi.fn();
    const recognizer = createLongPressRecognizer({
      onLongPress,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    recognizer.start({ x: 100, y: 200 });
    recognizer.move({ x: 140, y: 200 });
    clock.fireAll();

    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("tolerates a small finger wobble", () => {
    const clock = fakeClock();
    const onLongPress = vi.fn();
    const recognizer = createLongPressRecognizer({
      onLongPress,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    recognizer.start({ x: 100, y: 200 });
    recognizer.move({ x: 103, y: 202 });
    clock.fireAll();

    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("cancels an explicit release before the delay", () => {
    const clock = fakeClock();
    const onLongPress = vi.fn();
    const recognizer = createLongPressRecognizer({
      onLongPress,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });

    recognizer.start({ x: 10, y: 10 });
    recognizer.cancel();
    clock.fireAll();

    expect(onLongPress).not.toHaveBeenCalled();
    expect(clock.size()).toBe(0);
  });

  it("uses a deliberate half-second hold by default", () => {
    expect(LONG_PRESS_DELAY_MS).toBe(500);
  });
});
