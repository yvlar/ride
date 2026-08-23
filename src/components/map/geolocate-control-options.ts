export const RIDE_GEOLOCATE_CONTROL_OPTIONS = {
  positionOptions: {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 10_000,
  },
  trackUserLocation: true,
  showUserLocation: true,
  showAccuracyCircle: true,
} as const;

export const MAP_GEOLOCATE_LABEL = "Suivre ma position";
export const MAP_GEOLOCATE_UNAVAILABLE_LABEL = "Position indisponible";

export const GPS_TRACKING_UNAVAILABLE_MESSAGE =
  "La position actuelle est indisponible. Le trajet reste affiché.";
