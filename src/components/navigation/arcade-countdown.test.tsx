import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArcadeCountdown } from "./arcade-countdown";

describe("ArcadeCountdown (FR-046)", () => {
  it("shows the number it is handed", () => {
    render(<ArcadeCountdown step={3} />);

    const stage = screen.getByTestId("arcade-countdown");
    expect(stage).toHaveAttribute("data-step", "3");
    expect(stage.textContent).toBe("3");
  });

  it("colours each number like a starting light", () => {
    // The step rides on the element itself so the stylesheet can colour it
    // red, amber then green without a class per number in the component.
    for (const step of [3, 2, 1] as const) {
      const { unmount } = render(<ArcadeCountdown step={step} />);
      const number = screen.getByTestId("arcade-countdown").querySelector("p");
      expect(number).toHaveAttribute("data-step", String(step));
      unmount();
    }
  });

  it("ends on GO rather than on a fourth number", () => {
    render(<ArcadeCountdown step={0} />);

    const stage = screen.getByTestId("arcade-countdown");
    expect(stage).toHaveAttribute("data-step", "0");
    expect(stage.textContent).toBe("GO !");
  });

  it("never speaks over the session's own status line", () => {
    // The overlay already announces the state of the session through a
    // role="status" region; a countdown reading itself out would be noise.
    render(<ArcadeCountdown step={1} />);

    expect(screen.getByTestId("arcade-countdown")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("lets a touch through to the controls underneath", () => {
    // NFR-006 — "Terminer" must stay pressable while the countdown runs.
    render(<ArcadeCountdown step={2} />);

    expect(screen.getByTestId("arcade-countdown").className).toContain(
      "pointer-events-none",
    );
  });
});
