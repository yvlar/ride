import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DescribeDistanceSlider } from "./describe-distance-slider";

describe("DescribeDistanceSlider (FR-034)", () => {
  it("exposes 20–500 km bounds and the live value", () => {
    render(
      <DescribeDistanceSlider value={180} onChange={() => {}} />,
    );

    const slider = screen.getByRole("slider", {
      name: "Distance du trajet en kilomètres",
    });
    expect(slider).toHaveAttribute("aria-valuemin", "20");
    expect(slider).toHaveAttribute("aria-valuemax", "500");
    expect(slider).toHaveAttribute("aria-valuenow", "180");
    expect(slider).toHaveAttribute("aria-valuetext", "180 km");
    expect(screen.getByLabelText("180 km")).toBeInTheDocument();
  });

  it("updates the displayed distance when the slider moves", () => {
    const onChange = vi.fn();
    render(<DescribeDistanceSlider value={100} onChange={onChange} />);

    fireEvent.change(
      screen.getByRole("slider", { name: "Distance du trajet en kilomètres" }),
      { target: { value: "250" } },
    );
    expect(onChange).toHaveBeenCalledWith(250);
  });
});
