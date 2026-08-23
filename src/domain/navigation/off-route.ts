import {
  OFF_ROUTE_ACCURACY_MULTIPLIER,
  OFF_ROUTE_CONSECUTIVE_FIXES,
  OFF_ROUTE_MIN_DURATION_MS,
  OFF_ROUTE_MIN_THRESHOLD_M,
  PARALLEL_OR_SHORTCUT_MAX_M,
  RECALCULATE_COOLDOWN_MS,
} from "./constants";
import { isAccuracyUsable } from "./progress";
import type { OffRouteDecision, OffRouteTracker } from "./types";

export function offRouteThresholdM(accuracyMeters: number): number {
  return Math.max(
    OFF_ROUTE_MIN_THRESHOLD_M,
    accuracyMeters * OFF_ROUTE_ACCURACY_MULTIPLIER,
  );
}

export function emptyOffRouteTracker(): OffRouteTracker {
  return {
    consecutivePreciseOff: 0,
    firstOffAtMs: null,
    lastRecalculateAtMs: null,
    lastProgressKm: null,
  };
}

export function evaluateOffRoute(input: {
  distanceToRouteM: number;
  accuracyMeters: number;
  progressKm: number;
  nowMs: number;
  navigating: boolean;
  recalculating: boolean;
  tracker: OffRouteTracker;
  consecutiveFixes?: number;
  minDurationMs?: number;
  cooldownMs?: number;
}): { decision: OffRouteDecision; tracker: OffRouteTracker } {
  const tracker: OffRouteTracker = { ...input.tracker };

  if (!input.navigating) {
    return finish("stopped", false, emptyOffRouteTracker());
  }
  if (input.recalculating) {
    return finish("already_recalculating", false, tracker);
  }
  if (!isAccuracyUsable(input.accuracyMeters)) {
    return finish("low_accuracy", false, {
      ...tracker,
      consecutivePreciseOff: 0,
      firstOffAtMs: null,
    });
  }

  const cooldownMs = input.cooldownMs ?? RECALCULATE_COOLDOWN_MS;
  if (
    tracker.lastRecalculateAtMs !== null &&
    input.nowMs - tracker.lastRecalculateAtMs < cooldownMs
  ) {
    return finish("cooldown", false, tracker);
  }

  const threshold = offRouteThresholdM(input.accuracyMeters);
  const advancing =
    tracker.lastProgressKm === null ||
    input.progressKm + 0.01 >= tracker.lastProgressKm;
  tracker.lastProgressKm = input.progressKm;

  if (input.distanceToRouteM <= threshold) {
    return finish("on_route", false, {
      ...tracker,
      consecutivePreciseOff: 0,
      firstOffAtMs: null,
    });
  }

  if (
    advancing &&
    input.distanceToRouteM <= PARALLEL_OR_SHORTCUT_MAX_M
  ) {
    return finish("parallel_or_shortcut", false, {
      ...tracker,
      consecutivePreciseOff: 0,
      firstOffAtMs: null,
    });
  }

  tracker.consecutivePreciseOff += 1;
  tracker.firstOffAtMs ??= input.nowMs;

  const needed = input.consecutiveFixes ?? OFF_ROUTE_CONSECUTIVE_FIXES;
  const minDuration = input.minDurationMs ?? OFF_ROUTE_MIN_DURATION_MS;
  const persisted =
    tracker.consecutivePreciseOff >= needed &&
    input.nowMs - tracker.firstOffAtMs >= minDuration;

  if (!persisted) {
    return finish("single_reading", false, tracker);
  }

  return finish("persistent_off_route", true, tracker);
}

export function markRecalculateStarted(
  tracker: OffRouteTracker,
  nowMs: number,
): OffRouteTracker {
  return {
    ...tracker,
    lastRecalculateAtMs: nowMs,
    consecutivePreciseOff: 0,
    firstOffAtMs: null,
  };
}

function finish(
  reason: OffRouteDecision["reason"],
  shouldRecalculate: boolean,
  tracker: OffRouteTracker,
): { decision: OffRouteDecision; tracker: OffRouteTracker } {
  return {
    decision: {
      offRoute: reason === "persistent_off_route",
      shouldRecalculate,
      reason,
    },
    tracker,
  };
}
