"use client";

import { ArcadeNumber } from "@/components/navigation/arcade-number";
import { Label } from "@/components/ui/label";
import { useMapTheme } from "@/components/theme/map-theme-provider";
import {
  DESCRIBE_DISTANCE_MAX_KM,
  DESCRIBE_DISTANCE_MIN_KM,
  DESCRIBE_DISTANCE_STEP_KM,
  formatDescribeDistanceLabel,
  snapDescribeDistanceKm,
} from "@/domain/ride/describe-distance";
import { cn } from "@/lib/utils";

export function DescribeDistanceSlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (distanceKm: number) => void;
}) {
  const snapped = snapDescribeDistanceKm(value);
  const label = formatDescribeDistanceLabel(snapped);
  // FR-046 — the target distance is the headline figure of this panel and sits
  // well above the numerals' legibility floor, so it takes the arcade dial.
  const { resolvedTheme } = useMapTheme();
  const arcadeNumbers = resolvedTheme === "kart-arcade";

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor="describe-distance" className="text-base">
          Distance du trajet
        </Label>
        <p
          id="describe-distance-value"
          className="text-2xl font-semibold tabular-nums"
          aria-live="polite"
        >
          {arcadeNumbers ? <ArcadeNumber text={label} /> : label}
        </p>
      </div>
      <div className="flex min-h-14 items-center">
        <input
          id="describe-distance"
          type="range"
          min={DESCRIBE_DISTANCE_MIN_KM}
          max={DESCRIBE_DISTANCE_MAX_KM}
          step={DESCRIBE_DISTANCE_STEP_KM}
          value={snapped}
          disabled={disabled}
          aria-valuemin={DESCRIBE_DISTANCE_MIN_KM}
          aria-valuemax={DESCRIBE_DISTANCE_MAX_KM}
          aria-valuenow={snapped}
          aria-valuetext={label}
          aria-label="Distance du trajet en kilomètres"
          className={cn(
            "h-12 w-full cursor-pointer appearance-none rounded-full bg-muted",
            "accent-primary disabled:cursor-not-allowed disabled:opacity-50",
            "[&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:w-8",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-border",
            "[&::-webkit-slider-thumb]:bg-primary",
            "[&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:w-8",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-border",
            "[&::-moz-range-thumb]:bg-primary",
          )}
          onChange={(event) => {
            onChange(snapDescribeDistanceKm(Number(event.target.value)));
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{DESCRIBE_DISTANCE_MIN_KM} km</span>
        <span>{DESCRIBE_DISTANCE_MAX_KM} km</span>
      </div>
    </div>
  );
}
