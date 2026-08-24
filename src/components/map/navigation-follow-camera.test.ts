import { describe, expect, it } from "vitest";
import { offsetCoordinates } from "@/domain/geo/distance";
import {
  NAVIGATION_FOLLOW_LOOKAHEAD_KM,
  NAVIGATION_FOLLOW_PADDING,
  NAVIGATION_FOLLOW_PITCH,
  NAVIGATION_FOLLOW_ZOOM,
  finiteHeadingDeg,
  navigationFollowCamera,
  navigationFollowCenter,
} from "./navigation-follow-camera";

const puck = { latitude: 45.41, longitude: -72.72 };

describe("navigationFollowCamera (FR-024)", () => {
  it("pitches the street camera even when heading is unknown", () => {
    expect(navigationFollowCamera(puck, null)).toEqual({
      center: { lng: -72.72, lat: 45.41 },
      zoom: NAVIGATION_FOLLOW_ZOOM,
      pitch: NAVIGATION_FOLLOW_PITCH,
      padding: NAVIGATION_FOLLOW_PADDING,
      duration: 400,
      essential: true,
    });
  });

  it("looks ahead along the heading so more road is visible", () => {
    const ahead = offsetCoordinates(puck, 90, NAVIGATION_FOLLOW_LOOKAHEAD_KM);
    expect(navigationFollowCenter(puck, 90)).toEqual({
      lng: ahead.longitude,
      lat: ahead.latitude,
    });
    expect(navigationFollowCamera(puck, 90)).toEqual(
      expect.objectContaining({
        bearing: 90,
        pitch: NAVIGATION_FOLLOW_PITCH,
        zoom: NAVIGATION_FOLLOW_ZOOM,
      }),
    );
  });

  it("wraps a negative heading into 0-360", () => {
    expect(finiteHeadingDeg(-90)).toBe(270);
    expect(finiteHeadingDeg(Number.NaN)).toBeNull();
  });
});
