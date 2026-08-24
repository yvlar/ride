import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APPEARANCE_STORAGE_KEY } from "@/domain/appearance/appearance";
import { AppearanceProvider, useAppearance } from "./appearance-provider";

type MediaStub = {
  matches: boolean;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  dispatch: (matches: boolean) => void;
};

function installMatchMedia(matches: boolean): MediaStub {
  const listeners = new Set<EventListener>();
  const media: MediaStub = {
    matches,
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    removeEventListener(_type, listener) {
      listeners.delete(listener);
    },
    dispatch(next) {
      media.matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
  window.matchMedia = () => media as unknown as MediaQueryList;
  return media;
}

function ModeProbe() {
  const { mode, setMode } = useAppearance();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button type="button" onClick={() => setMode("system")}>
        Système
      </button>
    </div>
  );
}

describe("AppearanceProvider (FR-037)", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark", "night");
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    window.localStorage.clear();
    document.documentElement.classList.remove("dark", "night");
  });

  it("follows prefers-color-scheme while mode is system", () => {
    const media = installMatchMedia(true);
    render(
      <AppearanceProvider>
        <ModeProbe />
      </AppearanceProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "Système" }).click();
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      media.dispatch(false);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe("system");
  });
});
