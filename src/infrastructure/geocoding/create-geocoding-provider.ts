import { parseEnv, serverProcessEnv } from "@/lib/env";
import type { GeocodingProvider } from "./geocoding-provider";
import { HttpGeocodingProvider } from "./http-geocoding-provider";
import { mockGeocodingProvider } from "./mock-geocoding-provider";

export function createGeocodingProvider(
  source?: Record<string, string | undefined>,
): GeocodingProvider {
  const env = parseEnv(source ?? serverProcessEnv());

  if (env.GEOCODING_PROVIDER === "mock") {
    return mockGeocodingProvider;
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
    `Le fournisseur de géocodage « ${env.GEOCODING_PROVIDER} » n’est pas branché. Utilisez GEOCODING_PROVIDER=nominatim ou mock.`,
  );
}
