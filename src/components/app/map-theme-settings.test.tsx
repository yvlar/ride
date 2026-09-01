import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapThemeSettings } from "./map-theme-settings";

describe("MapThemeSettings (FR-045)", () => {
  it("marks the current theme as pressed", () => {
    render(<MapThemeSettings value="auto" onChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /Automatique/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Satellite/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reports the picked theme", () => {
    const onChange = vi.fn();
    render(<MapThemeSettings value="auto" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Relief/ }));

    expect(onChange).toHaveBeenCalledWith("terrain");
  });

  it("offers the existing themes and Kart Arcade", () => {
    render(<MapThemeSettings value="dark" onChange={vi.fn()} />);

    for (const label of [
      /Automatique/,
      /Clair/,
      /Sombre/,
      /Satellite/,
      /Relief/,
      /Kart Arcade/,
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});
