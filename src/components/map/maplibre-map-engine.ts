import {
  GeolocateControl,
  Map as MapLibreMap,
  Marker,
  type DataDrivenPropertyValueSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { coordinatesToPosition } from "@/domain/geo/distance";
import type { Coordinates } from "@/domain/geo/types";
import { FALLBACK_MAP_STYLE } from "./fallback-style";
import {
  GPS_TRACKING_UNAVAILABLE_MESSAGE,
  MAP_GEOLOCATE_LABEL,
  MAP_GEOLOCATE_UNAVAILABLE_LABEL,
  RIDE_GEOLOCATE_CONTROL_OPTIONS,
} from "./geolocate-control-options";
import {
  MAP_UNAVAILABLE_MESSAGE,
  type MapEngine,
  type MapEngineHandle,
  type MapStyleSource,
} from "./map-engine";
import { addRideBuildingExtrusions } from "./map-3d-buildings";
import {
  ensureRouteGateImage,
  routeGateFeatureCollection,
  routeGateLayer,
  routeMilepostFeatureCollection,
  routeMilepostLayer,
  ROUTE_GATE_SOURCE_ID,
  ROUTE_MILEPOST_SOURCE_ID,
} from "./route-gates";
import {
  STANDARD_MAP_OVERLAY_THEME,
  type MapDetailLevel,
  type MapOverlayTheme,
} from "./map-theme-overlay";
import { KART_ARCADE_DECOR_LAYER_PREFIX } from "./themes/kart-arcade-style";
import { createLongPressRecognizer } from "./long-press";
import {
  ROUTE_ARROW_LAYER_ID,
  ensureRouteArrowImage,
  routeArrowLayer,
} from "./route-arrows";
import {
  RECORDED_TRACK_END_LABEL,
  RECORDED_TRACK_START_LABEL,
  type RecordedTrackOverlay,
} from "./recorded-track-overlay";
import { ensureMapLibreWorkerUrl } from "./maplibre-worker-url";
import {
  NAVIGATION_MAX_PITCH,
  finiteHeadingDeg,
  followCameraDurationMs,
  navigationFollowCamera,
  prefersReducedMotion,
} from "./navigation-follow-camera";
import {
  createDirectionArrowElement,
  createPickMarkerElement,
  createPlaceMarkerElement,
  createUserPuckElement,
  enhanceGeolocateDotWithMotorcycle,
  headingFromGeolocateEvent,
  type PlaceMarkerKind,
} from "./ride-map-markers";
import "./ride-map-markers.css";
import {
  mapCameraFrame,
  rideRouteFeatureCollection,
  rideTraveledFeatureCollection,
  type RideMapViewModel,
} from "./ride-map-view-model";
import { createCloudMarkerElement } from "./weather-markers";
import { RADAR_LAYER_OPACITY, type WeatherMapOverlay } from "./weather-overlay";

export {
  NAVIGATION_FOLLOW_DURATION_MS,
  NAVIGATION_FOLLOW_PADDING,
  NAVIGATION_FOLLOW_PITCH,
  NAVIGATION_FOLLOW_ZOOM,
  NAVIGATION_MAX_PITCH,
} from "./navigation-follow-camera";

export const RADAR_SOURCE_ID = "ride-radar";
export const RADAR_LAYER_ID = "ride-radar-tiles";

/** Radar has to sit under the route: a cell must never hide the road. */
const ROUTE_LAYER_IDS = [
  "ride-route-casing",
  "ride-traveled-line",
  "ride-route-line",
] as const;

export const ROUTE_CASING_LAYER_ID = "ride-route-casing";

const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection" as const,
  features: [],
};

/**
 * Updates a GeoJSON source in place when it is already on the map. Returns
 * `false` when there is nothing to update, which is the caller's signal to add
 * the source and its layer for the first time.
 */
function setGeoJsonData(
  map: MapLibreMap,
  sourceId: string,
  data: unknown,
): boolean {
  const source = map.getSource(sourceId);
  if (source && "setData" in source && typeof source.setData === "function") {
    (source.setData as (value: unknown) => void)(data);
    return true;
  }
  return false;
}

export type MapLibreEngineOptions = {
  /** Result maps opt in (FR-022). Navigation maps must stay false (NFR-006). */
  geolocate?: boolean;
};

export function createMapLibreEngine(
  options: MapLibreEngineOptions = {},
): MapEngine {
  const geolocateAllowed = options.geolocate !== false;

  return {
    mount(
      container,
      viewModel,
      { onError, onWarning, onFollowUserChange, onPick, onMapStyleFallback },
      mountOptions,
    ): MapEngineHandle {
      const markers: Marker[] = [];
      const recordedMarkers: Marker[] = [];
      const cloudMarkers: Marker[] = [];
      let recordedTrack: RecordedTrackOverlay | null = null;
      /** A frame asked for while the style was still loading (see renderRoute). */
      let pendingFitCamera = false;
      let weather: WeatherMapOverlay | null = null;
      let radarTemplate: string | null = null;
      let map: MapLibreMap | undefined;
      /** FR-045 — the basemap in place, so a re-render never reloads tiles. */
      let currentStyleSource: MapStyleSource =
        mountOptions?.mapStyle ??
        (process.env.NEXT_PUBLIC_MAP_STYLE_URL || FALLBACK_MAP_STYLE);
      /** FR-046 — route, halo and building colours of the active theme. */
      let overlayTheme: MapOverlayTheme =
        mountOptions?.mapOverlay ?? STANDARD_MAP_OVERLAY_THEME;
      let detailLevel: MapDetailLevel = mountOptions?.detailLevel ?? "exploration";
      /**
       * Guards the listeners a theme swap registers: a rider tapping through
       * the themes must not leave a stack of `style.load` handlers behind.
       */
      let styleSwapId = 0;
      /** Detaches the listeners of the running style-health watch, if any. */
      let releaseStyleHealthWatch: (() => void) | null = null;
      let geolocateControl: GeolocateControl | undefined;
      let disposed = false;
      let lastGeolocateHeadingDeg: number | null = null;
      const reducedMotion = prefersReducedMotion();

      /**
       * FR-046 — the lean the free-roaming camera takes, from the theme. An
       * overview during navigation stays flat: a whole route seen edge-on is
       * a smear, and reading its shape beats the arcade look every time.
       */
      function framingPitchDeg(): number {
        return detailLevel === "navigation"
          ? 0
          : overlayTheme.explorationPitchDeg;
      }

      ensureMapLibreWorkerUrl();
      if (overlayTheme.containerClassName) {
        container.classList.add(overlayTheme.containerClassName);
      }
      let camera = mapCameraFrame(viewModel.bounds);
      let currentViewModel = viewModel;

      try {
        map = new MapLibreMap({
          container,
          style: currentStyleSource,
          attributionControl: { compact: true },
          bounds: camera.bounds,
          fitBoundsOptions: {
            ...camera.fitBoundsOptions,
            pitch: framingPitchDeg(),
            bearing: 0,
          },
          maxPitch: NAVIGATION_MAX_PITCH,
          pitch: framingPitchDeg(),
          locale: {
            "GeolocateControl.FindMyLocation": MAP_GEOLOCATE_LABEL,
            "GeolocateControl.LocationNotAvailable":
              MAP_GEOLOCATE_UNAVAILABLE_LABEL,
          },
        });
      } catch {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return { destroy() {} };
      }

      // MapLibre reports a missing WebGL2 context through an error event during
      // construction, but still returns a partially initialized Map instance.
      // That instance has no painter and Map#remove() throws when React later
      // unmounts it. Treat it as unavailable before adding controls or handlers.
      if (!map.painter) {
        onError(MAP_UNAVAILABLE_MESSAGE);
        return {
          destroy() {
            const mapToRemove = map;
            map = undefined;
            removeMapSafely(mapToRemove);
          },
        };
      }

      function attachGeolocateControl() {
        if (!map || disposed || geolocateControl || !geolocateAllowed) {
          return;
        }
        geolocateControl = new GeolocateControl(RIDE_GEOLOCATE_CONTROL_OPTIONS);
        map.addControl(geolocateControl, "top-right");
        labelGeolocateControl(container);
        geolocateControl.on("geolocate", (event) => {
          if (disposed) {
            return;
          }
          const heading = headingFromGeolocateEvent(event);
          if (heading != null) {
            lastGeolocateHeadingDeg = heading;
          }
          const dot = container.querySelector<HTMLElement>(
            ".maplibregl-user-location-dot",
          );
          if (!dot) {
            return;
          }
          enhanceGeolocateDotWithMotorcycle(dot, lastGeolocateHeadingDeg);
        });
        geolocateControl.on("error", () => {
          if (!disposed) {
            onWarning?.(GPS_TRACKING_UNAVAILABLE_MESSAGE);
          }
        });
      }

      function detachGeolocateControl() {
        if (!geolocateControl) {
          return;
        }
        if (map) {
          try {
            map.removeControl(geolocateControl);
          } catch {
            geolocateControl.onRemove();
          }
        } else {
          geolocateControl.onRemove();
        }
        geolocateControl = undefined;
      }

      attachGeolocateControl();

      map.on("error", () => {
        if (disposed || !map || map.isStyleLoaded()) {
          return;
        }
        onError(MAP_UNAVAILABLE_MESSAGE);
      });

      function renderRoute(
        next: typeof viewModel,
        options: { fitCamera?: boolean } = {},
      ) {
        currentViewModel = next;
        camera = mapCameraFrame(next.bounds);
        if (!map || disposed || !map.isStyleLoaded()) {
          // A route restored from a session, or one that simply beat the tiles,
          // must still be framed: remember the request for the load event
          // instead of dropping it with the render.
          pendingFitCamera = pendingFitCamera || options.fitCamera === true;
          return;
        }

        try {
          const source = map.getSource("ride-route");
          const data = rideRouteFeatureCollection(next);
          if (source && "setData" in source && typeof source.setData === "function") {
            source.setData(data);
          } else {
            map.addSource("ride-route", {
              type: "geojson",
              data,
            });
            // The halo goes in first so it stays under every other route layer;
            // MapLibre draws in insertion order (FR-046).
            if (overlayTheme.route.casingColor) {
              map.addLayer({
                id: ROUTE_CASING_LAYER_ID,
                type: "line",
                source: "ride-route",
                layout: {
                  "line-cap": "round",
                  "line-join": "round",
                },
                paint: {
                  "line-color": overlayTheme.route.casingColor,
                  "line-width": routeLineWidth(overlayTheme.route.casingWidth),
                },
              });
            }
            map.addLayer({
              id: "ride-route-line",
              type: "line",
              source: "ride-route",
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": overlayTheme.route.color,
                "line-width": routeLineWidth(overlayTheme.route.width),
              },
            });
            addRouteArrows(map);
          }
          renderRouteGates(map, next);

          // FR-042 — dimmed "already ridden" line beneath the live route.
          const traveledSource = map.getSource("ride-traveled");
          const traveledData = rideTraveledFeatureCollection(next);
          if (
            traveledSource &&
            "setData" in traveledSource &&
            typeof traveledSource.setData === "function"
          ) {
            traveledSource.setData(traveledData);
          } else {
            map.addSource("ride-traveled", {
              type: "geojson",
              data: traveledData,
            });
            map.addLayer(
              {
                id: "ride-traveled-line",
                type: "line",
                source: "ride-traveled",
                layout: {
                  "line-cap": "round",
                  "line-join": "round",
                },
                paint: {
                  "line-color": overlayTheme.route.traveledColor,
                  "line-width": routeLineWidth(overlayTheme.route.traveledWidth),
                  "line-opacity": 0.55,
                },
              },
              "ride-route-line",
            );
          }

          const connectorSource = map.getSource("ride-connector");
          const connectorData = next.connectorGeometry
            ? {
                type: "Feature" as const,
                properties: {},
                geometry: next.connectorGeometry,
              }
            : {
                type: "Feature" as const,
                properties: {},
                geometry: { type: "LineString" as const, coordinates: [] },
              };
          if (
            connectorSource &&
            "setData" in connectorSource &&
            typeof connectorSource.setData === "function"
          ) {
            connectorSource.setData(connectorData);
          } else {
            map.addSource("ride-connector", {
              type: "geojson",
              data: connectorData,
            });
            map.addLayer({
              id: "ride-connector-line",
              type: "line",
              source: "ride-connector",
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": overlayTheme.route.connectorColor,
                "line-width": 4,
                "line-dasharray": [1.5, 1.5],
              },
            });
          }

          for (const marker of markers) {
            marker.remove();
          }
          markers.length = 0;
          if (!next.idle) {
            markers.push(
              placeMarker(map, next.start.label, next.start.coordinates, "start"),
            );
            if (next.destination) {
              markers.push(
                placeMarker(
                  map,
                  next.destination.label,
                  next.destination.coordinates,
                  "destination",
                ),
              );
            }
            if (next.entry) {
              markers.push(
                placeMarker(
                  map,
                  next.entry.label,
                  next.entry.coordinates,
                  "entry",
                ),
              );
            }
            for (const arrow of next.directionArrows) {
              markers.push(placeArrow(map, arrow));
            }
          }

          // The constructor already frames the first view. A second fitBounds
          // during load can throw inside MapLibre's camera ease (NFR-006).
          if (options.fitCamera) {
            pendingFitCamera = false;
            map.fitBounds(
              camera.bounds,
              overviewFitBoundsOptions(camera, framingPitchDeg()),
            );
          }
        } catch {
          onWarning?.(MAP_UNAVAILABLE_MESSAGE);
        }
      }

      /** FR-041 — live recording trace, drawn above the planned route. */
      function renderRecordedTrack() {
        if (!map || disposed || !map.isStyleLoaded()) {
          return;
        }
        try {
          const data = {
            type: "Feature" as const,
            properties: {},
            geometry:
              recordedTrack?.geometry ??
              ({ type: "LineString" as const, coordinates: [] }),
          };
          const source = map.getSource("ride-recording");
          if (source && "setData" in source && typeof source.setData === "function") {
            source.setData(data);
          } else {
            map.addSource("ride-recording", { type: "geojson", data });
            map.addLayer({
              id: "ride-recording-line",
              type: "line",
              source: "ride-recording",
              layout: { "line-cap": "round", "line-join": "round" },
              paint: {
                "line-color": "#ef4444",
                "line-width": 5,
              },
            });
          }

          for (const marker of recordedMarkers) {
            marker.remove();
          }
          recordedMarkers.length = 0;
          if (recordedTrack?.startPoint) {
            recordedMarkers.push(
              placeMarker(
                map,
                RECORDED_TRACK_START_LABEL,
                recordedTrack.startPoint,
                "start",
              ),
            );
          }
          if (recordedTrack?.endPoint) {
            recordedMarkers.push(
              placeMarker(
                map,
                RECORDED_TRACK_END_LABEL,
                recordedTrack.endPoint,
                "destination",
              ),
            );
          }

          if (recordedTrack?.fitBounds && recordedTrack.bounds) {
            const frame = mapCameraFrame(recordedTrack.bounds);
            // Framing the recorded track takes the camera away from the rider:
            // report it so the UI can offer the recentre affordance (FR-042).
            setFollowUserState(false);
            map.fitBounds(frame.bounds, {
              ...overviewFitBoundsOptions(frame, framingPitchDeg()),
              duration: followCameraDurationMs(reducedMotion),
            });
            streetCameraActive = false;
          }
        } catch {
          onWarning?.(MAP_UNAVAILABLE_MESSAGE);
        }
      }

      /**
       * FR-043 — radar imagery below the route, cloud markers above it. The
       * whole layer is optional: a failure here warns and leaves the map, and
       * the route, exactly as they were.
       */
      function renderWeather() {
        if (!map || disposed) {
          return;
        }
        try {
          // Clouds are DOM markers: they need no style, so a map still
          // waiting on its tiles shows the sky rather than nothing.
          renderClouds(map);
          if (map.isStyleLoaded()) {
            renderRadar(map);
          }
        } catch {
          onWarning?.(MAP_UNAVAILABLE_MESSAGE);
        }
      }

      function renderRadar(target: MapLibreMap) {
        const template = weather?.radarTileUrlTemplate ?? null;
        if (!template) {
          removeRadar(target);
          return;
        }

        const source = target.getSource(RADAR_SOURCE_ID);
        if (source && template !== radarTemplate) {
          if ("setTiles" in source && typeof source.setTiles === "function") {
            source.setTiles([template]);
          } else {
            // An older raster source cannot be retargeted; rebuild it so
            // stepping to another frame still changes the picture.
            removeRadar(target);
          }
        }

        if (!target.getSource(RADAR_SOURCE_ID)) {
          target.addSource(RADAR_SOURCE_ID, {
            type: "raster",
            tiles: [template],
            tileSize: 256,
            // Without this the map requests zooms the provider does not serve
            // and paints its placeholder image over the route.
            ...(weather?.radarMaxZoom ? { maxzoom: weather.radarMaxZoom } : {}),
            ...(weather?.attribution
              ? { attribution: weather.attribution }
              : {}),
          });
          target.addLayer(
            {
              id: RADAR_LAYER_ID,
              type: "raster",
              source: RADAR_SOURCE_ID,
              paint: {
                "raster-opacity": weather?.radarOpacity ?? RADAR_LAYER_OPACITY,
              },
            },
            radarBeforeLayerId(target),
          );
        } else if (typeof target.setPaintProperty === "function") {
          target.setPaintProperty(
            RADAR_LAYER_ID,
            "raster-opacity",
            weather?.radarOpacity ?? RADAR_LAYER_OPACITY,
          );
        }

        radarTemplate = template;
      }

      function removeRadar(target: MapLibreMap) {
        radarTemplate = null;
        if (
          target.getLayer?.(RADAR_LAYER_ID) &&
          typeof target.removeLayer === "function"
        ) {
          target.removeLayer(RADAR_LAYER_ID);
        }
        if (
          target.getSource(RADAR_SOURCE_ID) &&
          typeof target.removeSource === "function"
        ) {
          target.removeSource(RADAR_SOURCE_ID);
        }
      }

      function renderClouds(target: MapLibreMap) {
        for (const marker of cloudMarkers) {
          marker.remove();
        }
        cloudMarkers.length = 0;
        for (const cloud of weather?.clouds ?? []) {
          cloudMarkers.push(
            new Marker({
              element: createCloudMarkerElement(cloud),
              anchor: "center",
            })
              .setLngLat(coordinatesToPosition(cloud.coordinates))
              .addTo(target),
          );
        }
      }

      // A style that settles late (slow or failing tiles) would otherwise leave
      // the radar undrawn: retry once it is ready, and only while it is
      // pending, so applying it does not feed itself another event.
      map.on("styledata", () => {
        const template = weather?.radarTileUrlTemplate;
        if (!template || template === radarTemplate) {
          return;
        }
        renderWeather();
      });

      /**
       * Everything this engine owns on top of the basemap. Called on the first
       * style load and again after a theme swap (FR-045): `setStyle` drops every
       * source and layer, and `load` does not fire a second time.
       */
      function renderStyleLayers() {
        if (disposed || !map) {
          return;
        }
        try {
          addRideBuildingExtrusions(map, overlayTheme.buildings);
        } catch {
          // Optional 3D buildings must not take down the street map (NFR-005).
        }
        renderRoute(currentViewModel);
        renderRecordedTrack();
        renderWeather();
        applyDetailLevel();
        applyPendingFrame();
      }

      /**
       * FR-046 — a style document can load while its tile source never does:
       * MapLibre reports that as an error *after* `style.load`, leaving a blank
       * ground. Watch until the first source is actually up, and treat any
       * error before that as the theme having failed (NFR-005).
       */
      function watchStyleHealth(onFailure: () => void) {
        releaseStyleHealthWatch?.();
        if (!map || disposed) {
          return;
        }
        const target = map;
        const detach = () => {
          target.off("error", onStyleHealthError);
          target.off("sourcedata", onSourceData);
          if (releaseStyleHealthWatch === detach) {
            releaseStyleHealthWatch = null;
          }
        };
        function onSourceData(event: { isSourceLoaded?: boolean }) {
          if (event?.isSourceLoaded) {
            detach();
          }
        }
        function onStyleHealthError(event?: { sourceId?: string }) {
          // A theme has failed when its data cannot be had — a source that
          // errors, or a style that never finishes loading. Anything reported
          // once the style is up and not tied to a source is cosmetic (a
          // missing image, a glyph range) and must not cost the rider a theme.
          const sourceFailed = Boolean(event?.sourceId);
          if (!sourceFailed && target.isStyleLoaded()) {
            return;
          }
          detach();
          onFailure();
        }
        target.on("error", onStyleHealthError);
        target.on("sourcedata", onSourceData);
        releaseStyleHealthWatch = detach;
      }

      /**
       * FR-046 — chevrons on top of the route. Added right after the route
       * line so they sit on it, and still under the DOM markers, which the
       * browser always paints above the canvas.
       */
      function addRouteArrows(target: MapLibreMap) {
        const { arrowColor, arrowOutline } = overlayTheme.route;
        if (!arrowColor || target.getLayer?.(ROUTE_ARROW_LAYER_ID)) {
          return;
        }
        try {
          if (!ensureRouteArrowImage(target, arrowColor, arrowOutline)) {
            // No 2D canvas: the route keeps its shape, just without chevrons.
            return;
          }
          target.addLayer(routeArrowLayer());
        } catch {
          // Decoration on top of the route must never cost the route itself.
        }
      }

      /**
       * FR-046 — the checkered gates at both ends of the route and the
       * kilometre boards between them. Both are decoration over the route, so
       * both follow the chevrons' contract: a style that cannot draw them
       * simply does not get them (NFR-005).
       */
      function renderRouteGates(target: MapLibreMap, next: RideMapViewModel) {
        const gates = overlayTheme.route.gates;
        if (!gates) {
          return;
        }
        // The gates mark the whole ride, not the part still ahead, so they take
        // the full geometry rather than the live route source.
        const geometry = next.idle ? null : next.geometry;
        const gateData = geometry
          ? routeGateFeatureCollection(geometry)
          : EMPTY_FEATURE_COLLECTION;
        const milepostData = geometry
          ? routeMilepostFeatureCollection(geometry)
          : EMPTY_FEATURE_COLLECTION;

        try {
          if (!setGeoJsonData(target, ROUTE_GATE_SOURCE_ID, gateData)) {
            if (!ensureRouteGateImage(target, gates.light, gates.dark)) {
              return;
            }
            target.addSource(ROUTE_GATE_SOURCE_ID, {
              type: "geojson",
              data: gateData,
            });
            target.addLayer(routeGateLayer());
          }
          if (!setGeoJsonData(target, ROUTE_MILEPOST_SOURCE_ID, milepostData)) {
            target.addSource(ROUTE_MILEPOST_SOURCE_ID, {
              type: "geojson",
              data: milepostData,
            });
            target.addLayer(
              routeMilepostLayer(gates.milepostText, gates.milepostHalo),
            );
          }
        } catch {
          // Decoration on top of the route must never cost the route itself.
        }
      }

      /**
       * FR-046 — leans the camera to the theme's angle, or back upright. Only
       * while the rider is free-roaming: a live follow camera and a framing
       * already under way both own the pitch, and stealing it mid-ride would
       * be a jolt at exactly the wrong moment.
       */
      function applyExplorationPitch() {
        if (!map || disposed || followUser || streetCameraActive) {
          return;
        }
        const pitch = framingPitchDeg();
        if (Math.abs(map.getPitch() - pitch) < 0.5) {
          return;
        }
        try {
          map.easeTo({
            pitch,
            duration: followCameraDurationMs(reducedMotion),
            essential: true,
          });
        } catch {
          // A camera that will not lean is a flat map, not a broken one.
        }
      }

      /** FR-046 — marks the container so the DOM markers follow the theme. */
      function applyContainerTheme(previous?: MapOverlayTheme) {
        const previousClass = previous?.containerClassName;
        if (previousClass) {
          container.classList.remove(previousClass);
        }
        if (overlayTheme.containerClassName) {
          container.classList.add(overlayTheme.containerClassName);
        }
      }

      /**
       * FR-046 — navigation drops the decorative layers and thickens the route.
       * Layer visibility is cheap: no style reload, no camera move, so it can
       * flip when a session starts without disturbing the GPS follow.
       */
      function applyDetailLevel() {
        if (!map || disposed) {
          return;
        }
        const navigating = detailLevel === "navigation";
        // FR-046 — publish the level on the container so the map controls can
        // follow it in CSS: riding calls for flat, opaque buttons, not frosted
        // ones. Purely cosmetic, so it is set before anything that can throw.
        container.dataset.mapMode = detailLevel;
        try {
          for (const layer of map.getStyle()?.layers ?? []) {
            if (!layer.id.startsWith(KART_ARCADE_DECOR_LAYER_PREFIX)) {
              continue;
            }
            map.setLayoutProperty(
              layer.id,
              "visibility",
              navigating ? "none" : "visible",
            );
          }
        } catch {
          // A style still settling simply keeps its own visibility (NFR-005).
        }
        // Contrast, not decoration: the route reads first while riding.
        const scale = navigating ? 1.25 : 1;
        setRouteWidth("ride-route-line", overlayTheme.route.width * scale);
        setRouteWidth(
          ROUTE_CASING_LAYER_ID,
          overlayTheme.route.casingWidth * scale,
        );
      }

      function setRouteWidth(layerId: string, width: number) {
        if (!map || disposed || !map.getLayer?.(layerId)) {
          return;
        }
        try {
          map.setPaintProperty(layerId, "line-width", routeLineWidth(width));
        } catch {
          // Width is a refinement; the route is already on screen.
        }
      }

      map.on("load", renderStyleLayers);

      if (overlayTheme.revertOnLoadFailure) {
        // A theme restored from Réglages gets the same safety net as one picked
        // now: the rider never lands on a blank map at startup.
        watchStyleHealth(() => onMapStyleFallback?.());
      }

      /**
       * Frame a route that could not be framed when it arrived. Deferred by a
       * frame: fitting while the constructor's own ease is still running can
       * throw inside MapLibre's camera (NFR-006).
       */
      function applyPendingFrame() {
        if (!pendingFitCamera || !map || disposed) {
          return;
        }
        pendingFitCamera = false;
        requestAnimationFrame(() => {
          if (!map || disposed || followUser || streetCameraActive) {
            return;
          }
          try {
            map.fitBounds(
              camera.bounds,
              overviewFitBoundsOptions(camera, framingPitchDeg()),
            );
          } catch {
            // The route is drawn either way; the rider can still frame it.
          }
        });
      }

      let userMarker: Marker | undefined;
      let followUser = false;
      let streetCameraActive = false;
      let lastUserCoordinates: Coordinates | null = null;
      let lastHeadingDeg: number | null = null;

      function applyUserPuckHeading(headingDeg: number | null) {
        if (!userMarker || headingDeg == null) {
          return;
        }
        userMarker.setRotationAlignment("map");
        userMarker.setPitchAlignment("viewport");
        userMarker.setRotation(headingDeg);
      }

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

      function applyFollowCamera() {
        if (!followUser || !map || disposed || !lastUserCoordinates) {
          return;
        }
        map.easeTo(
          navigationFollowCamera(lastUserCoordinates, lastHeadingDeg, {
            reducedMotion,
          }),
        );
        streetCameraActive = true;
      }

      function applyOverviewCamera() {
        if (!map || disposed) {
          return;
        }
        map.fitBounds(camera.bounds, {
          ...overviewFitBoundsOptions(camera, framingPitchDeg()),
          duration: followCameraDurationMs(reducedMotion),
        });
        streetCameraActive = false;
      }

      function onUserCameraInteraction(event?: { originalEvent?: Event }) {
        if (event?.originalEvent) {
          setFollowUserState(false);
        }
      }

      map.on("dragstart", onUserCameraInteraction);
      map.on("zoomstart", onUserCameraInteraction);
      map.on("rotatestart", onUserCameraInteraction);
      map.on("pitchstart", onUserCameraInteraction);

      // FR-038 — destination picking. Everything below is inert until
      // setPickEnabled(true); the preview and navigation maps never arm it.
      let pickEnabled = false;
      let pickMarker: Marker | undefined;

      function reportPick(lngLat: { lng: number; lat: number }) {
        if (disposed || !pickEnabled) {
          return;
        }
        onPick?.({ latitude: lngLat.lat, longitude: lngLat.lng });
      }

      const longPress = createLongPressRecognizer({
        onLongPress(point) {
          if (!map || disposed || !pickEnabled) {
            return;
          }
          try {
            reportPick(map.unproject([point.x, point.y]));
          } catch {
            // An unprojectable point simply drops the press.
          }
        },
      });

      function touchPoint(event: TouchEvent): { x: number; y: number } | null {
        const touch = event.touches.item(0) ?? event.changedTouches.item(0);
        if (!touch) {
          return null;
        }
        const rect = container.getBoundingClientRect();
        return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
      }

      function onTouchStart(event: TouchEvent) {
        if (!pickEnabled || event.touches.length !== 1) {
          longPress.cancel();
          return;
        }
        const point = touchPoint(event);
        if (point) {
          longPress.start(point);
        }
      }

      function onTouchMove(event: TouchEvent) {
        const point = touchPoint(event);
        if (point) {
          longPress.move(point);
        }
      }

      function onTouchEnd() {
        longPress.cancel();
      }

      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: true });
      container.addEventListener("touchend", onTouchEnd);
      container.addEventListener("touchcancel", onTouchEnd);

      map.on("click", (event) => {
        // MapLibre synthesizes a click for a tap too; the long press already
        // covers touch, so only a real mouse click drops a pin here.
        const original = event.originalEvent as PointerEvent | undefined;
        if (original && "pointerType" in original && original.pointerType === "touch") {
          return;
        }
        reportPick(event.lngLat);
      });

      return {
        destroy() {
          disposed = true;
          releaseStyleHealthWatch?.();
          releaseStyleHealthWatch = null;
          delete container.dataset.mapMode;
          if (overlayTheme.containerClassName) {
            container.classList.remove(overlayTheme.containerClassName);
          }
          longPress.cancel();
          container.removeEventListener("touchstart", onTouchStart);
          container.removeEventListener("touchmove", onTouchMove);
          container.removeEventListener("touchend", onTouchEnd);
          container.removeEventListener("touchcancel", onTouchEnd);
          detachGeolocateControl();
          pickMarker?.remove();
          pickMarker = undefined;
          userMarker?.remove();
          userMarker = undefined;
          for (const marker of markers) {
            marker.remove();
          }
          markers.length = 0;
          for (const marker of recordedMarkers) {
            marker.remove();
          }
          recordedMarkers.length = 0;
          for (const marker of cloudMarkers) {
            marker.remove();
          }
          cloudMarkers.length = 0;
          const mapToRemove = map;
          map = undefined;
          removeMapSafely(mapToRemove);
        },
        setViewModel(next) {
          if (disposed) {
            return;
          }
          // Refitting mid-ride is what made a recalculation look like the app
          // had jumped to another screen. Once the street camera is engaged,
          // a new route replaces the line and leaves the view alone (FR-042).
          renderRoute(next, { fitCamera: !followUser && !streetCameraActive });
        },
        resize() {
          if (!map || disposed) {
            return;
          }
          try {
            map.resize();
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        setUserLocation(coordinates, headingDeg) {
          if (!map || disposed) {
            return;
          }
          try {
            if (!coordinates) {
              lastUserCoordinates = null;
              userMarker?.remove();
              userMarker = undefined;
              return;
            }
            lastUserCoordinates = coordinates;
            lastHeadingDeg = finiteHeadingDeg(headingDeg) ?? lastHeadingDeg;
            const lngLat = coordinatesToPosition(coordinates);
            if (!userMarker) {
              userMarker = new Marker({
                element: createUserPuckElement(),
                anchor: "center",
                rotationAlignment: "map",
                pitchAlignment: "viewport",
              })
                .setLngLat(lngLat)
                .addTo(map);
            } else {
              userMarker.setLngLat(lngLat);
            }
            applyUserPuckHeading(lastHeadingDeg);
            applyFollowCamera();
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        setRecordedTrack(overlay) {
          if (disposed) {
            return;
          }
          recordedTrack = overlay;
          renderRecordedTrack();
        },
        setWeather(overlay) {
          if (disposed) {
            return;
          }
          weather = overlay;
          renderWeather();
        },
        setGeolocateEnabled(enabled) {
          if (disposed) {
            return;
          }
          if (enabled) {
            attachGeolocateControl();
            return;
          }
          detachGeolocateControl();
        },
        setFollowUser(enabled) {
          if (disposed) {
            return;
          }
          setFollowUserState(enabled);
          try {
            if (enabled) {
              applyFollowCamera();
              return;
            }
            // A pan already clears followUser, but stop still must restore
            // the top-down route frame (FR-013, FR-023).
            if (streetCameraActive) {
              applyOverviewCamera();
            }
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        setPickEnabled(enabled) {
          if (disposed) {
            return;
          }
          pickEnabled = enabled;
          if (!enabled) {
            longPress.cancel();
          }
        },
        setMapStyle(next, nextOverlay) {
          const overlayChanged =
            nextOverlay !== undefined && nextOverlay !== overlayTheme;
          if (!map || disposed || (next === currentStyleSource && !overlayChanged)) {
            return;
          }
          const previous = currentStyleSource;
          const previousOverlay = overlayTheme;
          currentStyleSource = next;
          if (nextOverlay) {
            overlayTheme = nextOverlay;
            applyContainerTheme(previousOverlay);
            applyExplorationPitch();
          }
          // The radar source goes with the old style; forget the template so
          // renderWeather rebuilds it instead of assuming it is still there.
          radarTemplate = null;
          // Every swap invalidates the listeners of the one before it, so a
          // rider tapping through themes never stacks handlers (FR-046).
          const swapId = ++styleSwapId;

          const revert = () => {
            if (!map || disposed || swapId !== styleSwapId) {
              return;
            }
            map.off("error", onStyleError);
            styleSwapId += 1;
            currentStyleSource = previous;
            overlayTheme = previousOverlay;
            applyContainerTheme(nextOverlay ?? previousOverlay);
            try {
              map.once("style.load", renderStyleLayers);
              map.setStyle(previous, { diff: false });
            } catch {
              // Nothing left to try: the previous basemap is the last resort.
            }
            onMapStyleFallback?.();
          };

          function onStyleError() {
            // Only a style that never finished loading is a failed theme; tile
            // hiccups afterwards are not, and the handler is gone by then.
            if (!map || disposed || swapId !== styleSwapId || map.isStyleLoaded()) {
              return;
            }
            revert();
          }

          const onStyleLoaded = () => {
            if (swapId !== styleSwapId) {
              return;
            }
            map?.off("error", onStyleError);
            renderStyleLayers();
            if (overlayTheme.revertOnLoadFailure) {
              watchStyleHealth(revert);
            } else {
              releaseStyleHealthWatch?.();
            }
          };

          try {
            // Registered first: an inline style specification settles inside
            // setStyle, so a handler added afterwards would miss the event.
            map.once("style.load", onStyleLoaded);
            map.on("error", onStyleError);
            map.setStyle(next, { diff: false });
          } catch {
            // Keep the basemap already on screen rather than an empty canvas
            // (NFR-005); the route and its text are untouched either way, and
            // the rider can pick the theme again.
            map.off("error", onStyleError);
            styleSwapId += 1;
            currentStyleSource = previous;
            overlayTheme = previousOverlay;
            applyContainerTheme(nextOverlay ?? previousOverlay);
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
            onMapStyleFallback?.();
          }
        },
        setDetailLevel(level) {
          if (disposed || level === detailLevel) {
            return;
          }
          detailLevel = level;
          applyDetailLevel();
          applyExplorationPitch();
        },
        setPickMarker(coordinates) {
          if (!map || disposed) {
            return;
          }
          try {
            if (!coordinates) {
              pickMarker?.remove();
              pickMarker = undefined;
              return;
            }
            const position = coordinatesToPosition(coordinates);
            if (!pickMarker) {
              pickMarker = new Marker({
                element: createPickMarkerElement(),
                anchor: "bottom",
                draggable: true,
              })
                .setLngLat(position)
                .addTo(map);
              // Dragging the marker is the second way to adjust a pick
              // (FR-038); it reports through the same callback.
              pickMarker.on("dragend", () => {
                const dragged = pickMarker?.getLngLat();
                if (dragged) {
                  reportPick(dragged);
                }
              });
              return;
            }
            pickMarker.setLngLat(position);
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        recenter() {
          if (!map || disposed) {
            return;
          }
          try {
            setFollowUserState(true);
            if (lastUserCoordinates) {
              applyFollowCamera();
              return;
            }
            applyOverviewCamera();
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
        overview() {
          if (!map || disposed) {
            return;
          }
          try {
            setFollowUserState(false);
            applyOverviewCamera();
          } catch {
            onWarning?.(MAP_UNAVAILABLE_MESSAGE);
          }
        },
      };
    },
  };
}

/**
 * Where to slip the radar in. Under the first label layer when the style has
 * one, so place names stay readable through a cell; otherwise under the route,
 * which must never be hidden either way.
 */
function radarBeforeLayerId(map: MapLibreMap): string | undefined {
  try {
    const labels = map.getStyle?.()?.layers?.find(
      (layer) => layer.type === "symbol",
    );
    if (labels) {
      return labels.id;
    }
  } catch {
    // A style that cannot be read just means the route decides the order.
  }
  for (const id of ROUTE_LAYER_IDS) {
    if (map.getLayer?.(id)) {
      return id;
    }
  }
  return undefined;
}

/**
 * FR-046 — the route keeps its weight across zoom levels: hairline-thin on an
 * overview and bold in a town, from a single width token per theme.
 */
export function routeLineWidth(
  base: number,
): DataDrivenPropertyValueSpecification<number> {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    6,
    base * 0.55,
    11,
    base * 0.8,
    15,
    base,
    19,
    base * 1.35,
  ];
}

function removeMapSafely(map: MapLibreMap | undefined): void {
  if (!map) {
    return;
  }
  try {
    map.remove();
  } catch {
    // A failed WebGL2 initialization leaves MapLibre without a painter. Its
    // remove() method currently throws in that state; cleanup must never crash
    // the surrounding React tree.
  }
}

function labelGeolocateControl(container: HTMLElement): void {
  const button = container.querySelector<HTMLButtonElement>(
    ".maplibregl-ctrl-geolocate",
  );
  button?.setAttribute("aria-label", MAP_GEOLOCATE_LABEL);
  button?.setAttribute("title", MAP_GEOLOCATE_LABEL);
}

function placeMarker(
  map: MapLibreMap,
  label: string,
  coordinates: RideMapViewModel["start"]["coordinates"],
  kind: PlaceMarkerKind,
): Marker {
  return new Marker({
    element: createPlaceMarkerElement(label, kind),
    anchor: "bottom",
  })
    .setLngLat(coordinatesToPosition(coordinates))
    .addTo(map);
}

function overviewFitBoundsOptions(
  frame: ReturnType<typeof mapCameraFrame>,
  pitchDeg = 0,
) {
  return {
    ...frame.fitBoundsOptions,
    pitch: pitchDeg,
    bearing: 0,
  };
}

function placeArrow(
  map: MapLibreMap,
  arrow: RideMapViewModel["directionArrows"][number],
): Marker {
  return new Marker({
    element: createDirectionArrowElement(0),
    anchor: "center",
    rotationAlignment: "map",
    pitchAlignment: "map",
    rotation: arrow.bearingDeg,
  })
    .setLngLat(coordinatesToPosition(arrow.coordinates))
    .addTo(map);
}
