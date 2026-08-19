import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("presents the Ride product promise", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Générateur de trajets moto" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/départ, d’une distance ou d’une destination/i),
    ).toBeInTheDocument();
  });
});
