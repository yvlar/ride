/**
 * FR-038 — long press recognizer for dropping a destination on a touch screen.
 *
 * A plain tap is too easy to trigger while panning the map, so touch requires a
 * deliberate press-and-hold. The recognizer is framework- and SDK-agnostic so
 * it can be unit tested without a map or a DOM harness.
 */

export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

export type LongPressPoint = { x: number; y: number };

export type LongPressRecognizerOptions = {
  delayMs?: number;
  moveTolerancePx?: number;
  onLongPress: (point: LongPressPoint) => void;
  /** Injected so tests can drive time without real timers. */
  setTimer?: (callback: () => void, delayMs: number) => number;
  clearTimer?: (handle: number) => void;
};

export type LongPressRecognizer = {
  start: (point: LongPressPoint) => void;
  move: (point: LongPressPoint) => void;
  cancel: () => void;
  /** True while a press is being timed. */
  pending: () => boolean;
};

export function createLongPressRecognizer(
  options: LongPressRecognizerOptions,
): LongPressRecognizer {
  const delayMs = options.delayMs ?? LONG_PRESS_DELAY_MS;
  const moveTolerancePx =
    options.moveTolerancePx ?? LONG_PRESS_MOVE_TOLERANCE_PX;
  const setTimer =
    options.setTimer ??
    ((callback, delay) => window.setTimeout(callback, delay));
  const clearTimer =
    options.clearTimer ?? ((handle) => window.clearTimeout(handle));

  let handle: number | null = null;
  let origin: LongPressPoint | null = null;

  function cancel(): void {
    if (handle !== null) {
      clearTimer(handle);
      handle = null;
    }
    origin = null;
  }

  return {
    start(point) {
      cancel();
      origin = point;
      handle = setTimer(() => {
        handle = null;
        const pressed = origin;
        origin = null;
        if (pressed) {
          options.onLongPress(pressed);
        }
      }, delayMs);
    },
    move(point) {
      if (handle === null || !origin) {
        return;
      }
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      // Panning the map must never drop a pin.
      if (Math.hypot(dx, dy) > moveTolerancePx) {
        cancel();
      }
    },
    cancel,
    pending() {
      return handle !== null;
    },
  };
}
