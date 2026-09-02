import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArcadeNumber } from "./arcade-number";

describe("ArcadeNumber (FR-046)", () => {
  it("keeps the whole value as one accessible label", () => {
    // The decoration splits the value into per-digit spans; a screen reader
    // must still hear "250 m", not three unrelated numbers.
    render(<ArcadeNumber text="250 m" testId="distance" />);

    const node = screen.getByTestId("distance");
    expect(node).toHaveAttribute("aria-label", "250 m");
    // The visible glyphs are decoration and must not be read a second time.
    expect(node.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("styles the digits and leaves everything else alone", () => {
    render(<ArcadeNumber text="12 km" testId="distance" />);

    const node = screen.getByTestId("distance");
    const digits = [...node.querySelectorAll("[data-digit]")].map(
      (span) => span.textContent,
    );
    expect(digits).toEqual(["1", "2"]);
    // The unit and the separator are not numerals and keep the panel's font.
    expect(node.textContent).toBe("12 km");
  });

  it("renders a value with no digits at all", () => {
    render(<ArcadeNumber text="—" testId="distance" />);

    const node = screen.getByTestId("distance");
    expect(node).toHaveAttribute("aria-label", "—");
    expect(node.querySelectorAll("[data-digit]")).toHaveLength(0);
  });
});
