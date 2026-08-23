import { createGeocodingProvider } from "@/infrastructure/geocoding/create-geocoding-provider";
import type { GeocodingProvider } from "@/infrastructure/geocoding/geocoding-provider";

export function getGeocodingProvider(): GeocodingProvider {
  return createGeocodingProvider();
}
