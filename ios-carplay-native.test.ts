import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readCarPlay(file: string): string {
  return readFileSync(path.join(process.cwd(), "ios/App/App/CarPlay", file), "utf8");
}

describe("native CarPlay session (FR-028)", () => {
  const snapshot = readCarPlay("RideCarPlaySnapshot.swift");
  const session = readCarPlay("RideCarPlaySession.swift");
  const plugin = readCarPlay("RideCarPlayPlugin.swift");
  const scene = readCarPlay("CarPlaySceneDelegate.swift");

  it("parses routeId and cancelSpeech from the JS snapshot", () => {
    expect(snapshot).toContain("let routeId: String");
    expect(snapshot).toContain("let cancelSpeech: Bool");
    expect(snapshot).toContain("call.getString(\"routeId\")");
    expect(snapshot).toContain("call.getBool(\"cancelSpeech\")");
  });

  it("ignores updates after stop until the next start", () => {
    expect(session).toContain("private var stopped = false");
    expect(session).toContain("guard !stopped else");
    expect(session).toContain("stopped = true");
    expect(session).toContain("stopped = false");
  });

  it("exposes getConnection and stopRequested for missed native events", () => {
    expect(plugin).toContain("getConnection");
    expect(plugin).toContain("stopRequested");
    expect(plugin).toContain("func emitStop()");
    expect(plugin).toContain("consumePendingStop()");
    expect(session).toContain("func requestStop()");
    expect(session).toContain("pendingStop");
    expect(session).toContain("func consumePendingStop()");
    expect(session).toContain("awaitingMuteEcho");
    expect(session).toContain("snapshot.withMute(muted)");
  });

  it("uses a 3D heading-up street camera with buildings (FR-024, FR-028)", () => {
    const map = readCarPlay("RideCarPlayMapViewController.swift");
    expect(map).toContain("showsBuildings = true");
    expect(map).toContain("pitch: 60");
    expect(map).toContain("1_200");
  });

  it("offers Arrêter, Trajets, CPListTemplate, CPSearchTemplate, rebuilds the trip on routeId change, and cancels speech on recalculate", () => {
    expect(scene).toContain("Arrêter");
    expect(scene).toContain("Trajets");
    expect(scene).toContain("CPListTemplate");
    expect(scene).toContain("CPSearchTemplate");
    expect(scene).toContain("requestStop()");
    expect(scene).toContain("currentRouteId != snapshot.routeId");
    expect(scene).toContain("snapshot.muted || snapshot.cancelSpeech");
    expect(scene).toContain("updateSections");
    expect(scene).not.toMatch(/_ = catalog/);
    expect(scene).toContain("popToRootTemplate");
    expect(scene).toContain("pushOverMap");
  });
});
