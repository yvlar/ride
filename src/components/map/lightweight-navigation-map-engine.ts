import type { Coordinates, Position } from "@/domain/geo/types";
import type { MapEngine, MapEngineHandle } from "./map-engine";
import { createMotorcycleSvgGlyph } from "./ride-map-markers";
import type { RideMapViewModel } from "./ride-map-view-model";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_SIZE = 1_000;
const PADDING = 55;
const FOLLOW_VIEW_SIZE = 360;
const MAX_ROUTE_POINTS = 800;

type ProjectedPoint = { x: number; y: number };

/**
 * Route-only SVG map kept as an explicit fallback when WebGL cannot start.
 * Production preview and navigation use a single shared street map (FR-013).
 */
export function createLightweightNavigationMapEngine(): MapEngine {
  return {
    mount(container, initialViewModel, handlers): MapEngineHandle {
      let disposed = false;
      let followUser = false;
      const onFollowUserChange = handlers?.onFollowUserChange;

      function setFollowUserState(next: boolean) {
        if (followUser === next) {
          return;
        }
        followUser = next;
        try {
          onFollowUserChange?.(next);
        } catch {
          // A listener must never take down the map (NFR-006).
        }
      }

      let viewModel = initialViewModel;
      let lastUser: Coordinates | null = null;
      let lastHeadingDeg: number | null = null;
      let userPoint: ProjectedPoint | null = null;

      const root = document.createElement("div");
      root.className =
        "relative h-full min-h-64 w-full overflow-hidden bg-slate-100 dark:bg-slate-950";

      const svg = createSvgElement("svg");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Tracé du trajet en mode allégé");
      svg.setAttribute("viewBox", `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.classList.add("h-full", "w-full");
      svg.style.background = "#e2e8f0";

      appendGrid(svg);

      const routeLayer = createSvgElement("g");
      routeLayer.setAttribute("data-route-lines", "true");
      svg.append(routeLayer);

      const placeLayer = createSvgElement("g");
      placeLayer.setAttribute("data-place-markers", "true");
      svg.append(placeLayer);

      const userMarker = createSvgElement("g");
      userMarker.setAttribute("data-current-location", "true");
      userMarker.setAttribute("aria-label", "Position actuelle");
      userMarker.setAttribute("visibility", "hidden");
      const pulse = createSvgElement("circle");
      pulse.setAttribute("r", "28");
      pulse.setAttribute("fill", "#38bdf8");
      pulse.setAttribute("fill-opacity", "0.25");
      const disc = createSvgElement("circle");
      disc.setAttribute("r", "18");
      disc.setAttribute("fill", "#0284c7");
      disc.setAttribute("stroke", "white");
      disc.setAttribute("stroke-width", "3");
      userMarker.append(pulse, disc, createMotorcycleSvgGlyph({ size: 28 }));
      svg.append(userMarker);

      const caption = document.createElement("p");
      caption.className =
        "pointer-events-none absolute bottom-2 left-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground";
      caption.textContent = "Carte simplifiée";

      root.append(svg, caption);
      container.append(root);

      function updateFollowView() {
        if (!followUser || !userPoint) {
          svg.setAttribute("viewBox", `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`);
          return;
        }
        const half = FOLLOW_VIEW_SIZE / 2;
        svg.setAttribute(
          "viewBox",
          `${userPoint.x - half} ${userPoint.y - half} ${FOLLOW_VIEW_SIZE} ${FOLLOW_VIEW_SIZE}`,
        );
      }

      function applyUserLocation(
        coordinates: Coordinates | null,
        headingDeg?: number | null,
      ) {
        lastUser = coordinates;
        if (typeof headingDeg === "number" && Number.isFinite(headingDeg)) {
          lastHeadingDeg = ((headingDeg % 360) + 360) % 360;
        }
        userPoint = coordinates ? project(coordinates, viewModel) : null;
        if (!userPoint) {
          userMarker.setAttribute("visibility", "hidden");
          updateFollowView();
          return;
        }
        userMarker.setAttribute("visibility", "visible");
        const heading =
          lastHeadingDeg != null && Number.isFinite(lastHeadingDeg)
            ? lastHeadingDeg
            : 0;
        userMarker.setAttribute(
          "transform",
          `translate(${userPoint.x} ${userPoint.y}) rotate(${heading})`,
        );
        updateFollowView();
      }

      function appendRouteLine(
        line: { coordinates: Position[] },
        next: RideMapViewModel,
        options: { stroke: string; width: string; opacity?: string; role?: string },
      ) {
        const polyline = createSvgElement("polyline");
        polyline.setAttribute("fill", "none");
        polyline.setAttribute("stroke", options.stroke);
        polyline.setAttribute("stroke-width", options.width);
        polyline.setAttribute("stroke-linecap", "round");
        polyline.setAttribute("stroke-linejoin", "round");
        polyline.setAttribute("vector-effect", "non-scaling-stroke");
        if (options.opacity) {
          polyline.setAttribute("stroke-opacity", options.opacity);
        }
        if (options.role) {
          polyline.setAttribute("data-line", options.role);
        }
        polyline.setAttribute(
          "points",
          samplePositions(line.coordinates)
            .map((position) =>
              project({ latitude: position[1], longitude: position[0] }, next),
            )
            .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
            .join(" "),
        );
        routeLayer.append(polyline);
      }

      function applyViewModel(next: RideMapViewModel) {
        viewModel = next;
        routeLayer.replaceChildren();
        // FR-042 — the ridden portion first, so the live route paints over it.
        if (
          !next.idle &&
          next.traveledGeometry &&
          next.traveledGeometry.coordinates.length >= 2
        ) {
          appendRouteLine(next.traveledGeometry, next, {
            stroke: "#64748b",
            width: "10",
            opacity: "0.55",
            role: "traveled",
          });
        }
        const remaining =
          next.remainingGeometry &&
          next.remainingGeometry.coordinates.length >= 2
            ? next.remainingGeometry
            : next.geometry;
        const lines = next.idle
          ? []
          : next.parts && next.parts.length > 0
            ? next.parts
            : [remaining];
        for (const line of lines) {
          appendRouteLine(line, next, {
            stroke: "#0f766e",
            width: "10",
            role: "remaining",
          });
        }
        if (next.connectorGeometry) {
          const connector = createSvgElement("polyline");
          connector.setAttribute("fill", "none");
          connector.setAttribute("stroke", "#d97706");
          connector.setAttribute("stroke-width", "8");
          connector.setAttribute("stroke-dasharray", "16 12");
          connector.setAttribute("stroke-linecap", "round");
          connector.setAttribute("vector-effect", "non-scaling-stroke");
          connector.setAttribute(
            "points",
            samplePositions(next.connectorGeometry.coordinates)
              .map((position) =>
                project(
                  { latitude: position[1], longitude: position[0] },
                  next,
                ),
              )
              .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
              .join(" "),
          );
          routeLayer.append(connector);
        }
        placeLayer.replaceChildren();
        appendPlaceMarker(
          placeLayer,
          project(next.start.coordinates, next),
          "Départ",
          "#16a34a",
        );
        if (next.destination) {
          appendPlaceMarker(
            placeLayer,
            project(next.destination.coordinates, next),
            "Destination",
            "#dc2626",
          );
        }
        if (next.entry) {
          appendPlaceMarker(
            placeLayer,
            project(next.entry.coordinates, next),
            "Entrée GPX",
            "#d97706",
          );
        }
        applyUserLocation(lastUser);
      }

      applyViewModel(initialViewModel);

      return {
        destroy() {
          disposed = true;
          root.remove();
        },
        setViewModel(next) {
          if (disposed) {
            return;
          }
          applyViewModel(next);
        },
        setUserLocation(coordinates, headingDeg) {
          if (disposed) {
            return;
          }
          applyUserLocation(coordinates, headingDeg);
        },
        setFollowUser(enabled) {
          if (disposed) {
            return;
          }
          setFollowUserState(enabled);
          updateFollowView();
        },
        recenter() {
          if (disposed) {
            return;
          }
          setFollowUserState(true);
          updateFollowView();
        },
        resize() {},
        setGeolocateEnabled() {},
      };
    },
  };
}

function samplePositions(positions: Position[]): Position[] {
  if (positions.length <= MAX_ROUTE_POINTS) {
    return positions;
  }
  const sampled: Position[] = [];
  const lastIndex = positions.length - 1;
  for (let index = 0; index < MAX_ROUTE_POINTS; index += 1) {
    const sourceIndex = Math.round((index / (MAX_ROUTE_POINTS - 1)) * lastIndex);
    sampled.push(positions[sourceIndex]!);
  }
  return sampled;
}

function project(
  coordinates: Coordinates,
  viewModel: RideMapViewModel,
): ProjectedPoint {
  const longitudeSpan = Math.max(
    Number.EPSILON,
    viewModel.bounds.east - viewModel.bounds.west,
  );
  const latitudeSpan = Math.max(
    Number.EPSILON,
    viewModel.bounds.north - viewModel.bounds.south,
  );
  const drawable = VIEW_SIZE - PADDING * 2;
  return {
    x:
      PADDING +
      ((coordinates.longitude - viewModel.bounds.west) / longitudeSpan) *
        drawable,
    y:
      PADDING +
      ((viewModel.bounds.north - coordinates.latitude) / latitudeSpan) *
        drawable,
  };
}

function appendGrid(svg: SVGSVGElement): void {
  const background = createSvgElement("rect");
  background.setAttribute("width", String(VIEW_SIZE));
  background.setAttribute("height", String(VIEW_SIZE));
  background.setAttribute("fill", "#e2e8f0");
  svg.append(background);

  for (const offset of [200, 400, 600, 800]) {
    const vertical = createSvgElement("line");
    vertical.setAttribute("x1", String(offset));
    vertical.setAttribute("x2", String(offset));
    vertical.setAttribute("y1", "0");
    vertical.setAttribute("y2", String(VIEW_SIZE));
    vertical.setAttribute("stroke", "#cbd5e1");
    vertical.setAttribute("stroke-width", "2");
    const horizontal = createSvgElement("line");
    horizontal.setAttribute("x1", "0");
    horizontal.setAttribute("x2", String(VIEW_SIZE));
    horizontal.setAttribute("y1", String(offset));
    horizontal.setAttribute("y2", String(offset));
    horizontal.setAttribute("stroke", "#cbd5e1");
    horizontal.setAttribute("stroke-width", "2");
    svg.append(vertical, horizontal);
  }
}

function appendPlaceMarker(
  parent: SVGGElement,
  point: ProjectedPoint,
  label: string,
  color: string,
): void {
  const marker = createSvgElement("circle");
  marker.setAttribute("cx", String(point.x));
  marker.setAttribute("cy", String(point.y));
  marker.setAttribute("r", "15");
  marker.setAttribute("fill", color);
  marker.setAttribute("stroke", "white");
  marker.setAttribute("stroke-width", "5");
  marker.setAttribute("aria-label", label);
  parent.append(marker);
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}
