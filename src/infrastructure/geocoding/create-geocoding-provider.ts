import { parseEnv, serverProcessEnv } from "@/lib/env";
import type { GeocodingProvider } from "./geocoding-provider";
import { HttpGeocodingProvider } from "./http-geocoding-provider";
import { mockGeocodingProvider } from "./mock-geocoding-provider";
import {
  PHOTON_BASE_URL,
  PhotonGeocodingProvider,
} from "./photon-geocoding-provider";

/**
 * FR-032 — Photon needs no key, so the default is a real search rather than a
 * fixture list. `GEOCODING_API_BASE_URL` points at a self-hosted instance;
 * `GEOCODING_PROVIDER=mock` keeps the app working offline.
 */
export function createGeocodingProvider(
  source?: Record<string, string | undefined>,
): GeocodingProvider {
  const env = parseEnv(source ?? serverProcessEnv());

  if (env.GEOCODING_PROVIDER === "mock") {
    return mockGeocodingProvider;
  }

  if (env.GEOCODING_PROVIDER === "photon") {
    return new PhotonGeocodingProvider(
      env.GEOCODING_API_BASE_URL ?? PHOTON_BASE_URL,
      fetch,
      env.GEOCODING_API_KEY,
    );
  }

  if (env.GEOCODING_PROVIDER === "nominatim") {
    if (!env.GEOCODING_API_BASE_URL) {
      throw new Error(
        "GEOCODING_API_BASE_URL est requis lorsque GEOCODING_PROVIDER=nominatim.",
      );
    }
    return new HttpGeocodingProvider(
      env.GEOCODING_API_BASE_URL,
      fetch,
      env.GEOCODING_API_KEY,
    );
  }

  throw new Error(
    `Le fournisseur de géocodage « ${env.GEOCODING_PROVIDER} » n’est pas branché. Utilisez GEOCODING_PROVIDER=photon, nominatim ou mock.`,
  );
}
