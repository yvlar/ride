import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapQuickActions } from "./map-quick-actions";

describe("MapQuickActions", () => {
  it("exposes the four map actions in a compact two-column grid", () => {
    const handlers = {
      onSearch: vi.fn(),
      onDescribe: vi.fn(),
      onCatalog: vi.fn(),
      onImportGpx: vi.fn(),
    };

    render(<MapQuickActions {...handlers} />);

    const region = screen.getByRole("region", { name: "Actions principales" });
    expect(region).toHaveClass(
      "ride-quick-actions",
      "grid-cols-2",
      "w-full",
      "max-w-md",
    );
    expect(region).not.toHaveClass("bg-card", "bg-black", "bg-slate-950/55");
    const buttons = within(region).getAllByRole("button");
    expect(buttons).toHaveLength(4);

    fireEvent.click(
      within(region).getByRole("button", {
        name: "Rechercher une destination",
      }),
    );
    fireEvent.click(
      within(region).getByRole("button", { name: "Décrire mon trajet" }),
    );
    fireEvent.click(
      within(region).getByRole("button", {
        name: "Découvrir des trajets moto",
      }),
    );
    fireEvent.click(
      within(region).getByRole("button", {
        name: "Importer un fichier GPX",
      }),
    );

    expect(handlers.onSearch).toHaveBeenCalledOnce();
    expect(handlers.onDescribe).toHaveBeenCalledOnce();
    expect(handlers.onCatalog).toHaveBeenCalledOnce();
    expect(handlers.onImportGpx).toHaveBeenCalledOnce();
    for (const button of buttons) {
      expect(button).toHaveClass(
        "ride-glass",
        "ride-quick-action",
        "min-h-[clamp(4.5rem,11dvh,5.5rem)]",
        "min-w-0",
        "w-full",
        "justify-start",
      );
    }
    expect(region.querySelectorAll(".ride-quick-action-icon")).toHaveLength(4);
    expect(region.querySelectorAll(".ride-quick-action-label")).toHaveLength(4);
  });

  it("labels each action with its own colour hook and a single word", () => {
    render(
      <MapQuickActions
        onSearch={vi.fn()}
        onDescribe={vi.fn()}
        onCatalog={vi.fn()}
        onImportGpx={vi.fn()}
      />,
    );

    const region = screen.getByRole("region", { name: "Actions principales" });
    expect(
      [...region.querySelectorAll("[data-quick-action]")].map((button) =>
        button.getAttribute("data-quick-action"),
      ),
    ).toEqual(["search", "describe", "catalog", "gpx"]);

    // One word on the plate, the full wording only on the accessible name.
    expect(
      [...region.querySelectorAll(".ride-quick-action-label")].map(
        (label) => label.textContent,
      ),
    ).toEqual(["Destination", "Décrire", "Découvrir", "Importer"]);
    expect(
      within(region)
        .getByRole("button", { name: "Rechercher une destination" })
        .textContent,
    ).toBe("Destination");
  });

  it("keeps resume available without changing the four primary actions", () => {
    const onResume = vi.fn();
    render(
      <MapQuickActions
        onSearch={vi.fn()}
        onDescribe={vi.fn()}
        onCatalog={vi.fn()}
        onImportGpx={vi.fn()}
        onResume={onResume}
      />,
    );

    const resume = screen.getByRole("button", {
      name: "Reprendre la navigation",
    });
    fireEvent.click(resume);
    expect(onResume).toHaveBeenCalledOnce();
  });
});
