import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoutePreferenceSettings } from "./route-preference-settings";
import { DEFAULT_ROUTE_PREFERENCES } from "@/domain/ride/stored-route-preferences";

describe("RoutePreferenceSettings (FR-007, FR-008, FR-030, FR-031)", () => {
  it("exposes the three route preferences", () => {
    render(
      <RoutePreferenceSettings
        value={DEFAULT_ROUTE_PREFERENCES}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Éviter les autoroutes")).toBeChecked();
    expect(screen.getByLabelText("Éviter les routes non pavées")).toBeChecked();
    expect(screen.getByLabelText("Canada seulement")).not.toBeChecked();
  });

  it("reports a change when a switch is toggled", () => {
    const onChange = vi.fn();
    render(
      <RoutePreferenceSettings
        value={DEFAULT_ROUTE_PREFERENCES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Canada seulement"));
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_ROUTE_PREFERENCES,
      stayInCanada: true,
    });
  });
});
