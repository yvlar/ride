import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home (FR-014)", () => {
  it("presents the Ride product promise and an interactive form", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Générateur de trajets moto" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/départ, d’une distance ou d’une destination/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Point de départ" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Générer ma ride" }),
    ).toBeEnabled();
  });
});
