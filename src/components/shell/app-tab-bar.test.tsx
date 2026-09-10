import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppTabBar } from "./app-tab-bar";

describe("AppTabBar", () => {
  it("moves settings into the explorer map controls", () => {
    const onChange = vi.fn();

    render(<AppTabBar value="explore" onChange={onChange} />);

    const settings = screen.getByRole("button", { name: "Réglages" });
    expect(settings).toHaveAttribute("data-testid", "explorer-settings-button");
    expect(settings).toHaveClass(
      "maplibregl-ctrl",
      "maplibregl-ctrl-group",
      "fixed",
      "right-[max(0.75rem,env(safe-area-inset-right))]",
      "top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)]",
      "size-11",
    );

    fireEvent.click(settings);
    expect(onChange).toHaveBeenCalledWith("settings");
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mes trajets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrés" })).toBeInTheDocument();
  });

  it("places the MapLibre location control on the top-left in explorer", () => {
    render(<AppTabBar value="explore" onChange={vi.fn()} />);

    const style = document.querySelector("style");
    expect(style?.textContent).toContain(".maplibregl-ctrl-top-right");
    expect(style?.textContent).toContain(
      "left: max(0.75rem, env(safe-area-inset-left, 0px));",
    );
    expect(style?.textContent).toContain("right: auto;");
  });

  it("removes the settings control from the bottom navigation", () => {
    const onChange = vi.fn();

    render(<AppTabBar value="rides" onChange={onChange} />);

    expect(
      screen.queryByRole("button", { name: "Réglages" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toHaveClass(
      "grid-cols-3",
    );
  });
});
