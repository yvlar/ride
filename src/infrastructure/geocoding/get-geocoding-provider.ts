import { mockGeocodingProvider } from "@/infrastructure/geocoding/mock-geocoding-provider";
import type { GeocodingProvider } from "@/infrastructure/geocoding/geocoding-provider";

export function getGeocodingProvider(): GeocodingProvider {
  return mockGeocodingProvider;
}
