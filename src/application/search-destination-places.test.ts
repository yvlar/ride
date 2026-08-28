import { describe, expect, it, vi } from "vitest";
import type { Place } from "@/domain/geo/types";
import type { PostalCodeLocation } from "@/domain/postal-codes/postal-code";
import type { PostalCodeProvider } from "@/domain/postal-codes/postal-code-provider";
import type { GeocodingProvider } from "@/infrastructure/geocoding/geocoding-provider";
import { searchDestinationPlaces } from "./search-destination-places";

const GRANBY: PostalCodeLocation = {
  postalCode: "J2G2W4",
  latitude: 45.4008,
  longitude: -72.7331,
  municipality: "Granby",
  region: "QC",
};

const GEOCODED: Place = {
  label: "Granby, QC",
  coordinates: { latitude: 45.4001, longitude: -72.7342 },
};

function geocodingStub(places: Place[] = [GEOCODED]): {
  provider: GeocodingProvider;
  search: ReturnType<typeof vi.fn>;
} {
  const search = vi.fn().mockResolvedValue(places);
  return {
    provider: { search, reverse: vi.fn() } as unknown as GeocodingProvider,
    search,
  };
}

function postalCodeStub(
  find: (postalCode: string) => Promise<PostalCodeLocation | null>,
): { provider: PostalCodeProvider; find: ReturnType<typeof vi.fn> } {
  const mock = vi.fn(find);
  return { provider: { find: mock }, find: mock };
}

describe("searchDestinationPlaces (FR-040)", () => {
  it("résout un code postal trouvé sans appeler le géocodage", async () => {
    const geocoding = geocodingStub();
    const postalCodes = postalCodeStub(async () => GRANBY);

    const places = await searchDestinationPlaces("J2G 2W4", "fr", {
      geocoding: geocoding.provider,
      postalCodes: postalCodes.provider,
    });

    expect(places).toEqual([
      {
        label: "J2G 2W4, Granby, QC",
        coordinates: { latitude: 45.4008, longitude: -72.7331 },
        name: "J2G 2W4",
        locality: "Granby",
        region: "QC",
        // FR-038 — the recap card and the result badge read these.
        kind: "postal_code",
        precision: "exact",
        source: "search",
        postalCode: "J2G 2W4",
      },
    ]);
    expect(postalCodes.find).toHaveBeenCalledWith("J2G2W4");
    expect(geocoding.search).not.toHaveBeenCalled();
  });

  it("donne le même résultat pour « J2G 2W4 » et « J2G2W4 »", async () => {
    const geocoding = geocodingStub();
    const postalCodes = postalCodeStub(async () => GRANBY);
    const dependencies = {
      geocoding: geocoding.provider,
      postalCodes: postalCodes.provider,
    };

    const spaced = await searchDestinationPlaces("J2G 2W4", "fr", dependencies);
    const compact = await searchDestinationPlaces("j2g2w4", "fr", dependencies);

    expect(spaced).toEqual(compact);
    expect(postalCodes.find).toHaveBeenNthCalledWith(1, "J2G2W4");
    expect(postalCodes.find).toHaveBeenNthCalledWith(2, "J2G2W4");
  });

  it("retombe sur le géocodage quand le code postal est inconnu (FR-032)", async () => {
    const geocoding = geocodingStub();
    const postalCodes = postalCodeStub(async () => null);

    const places = await searchDestinationPlaces("K1A 0B1", "fr", {
      geocoding: geocoding.provider,
      postalCodes: postalCodes.provider,
    });

    expect(places).toEqual([GEOCODED]);
    expect(geocoding.search).toHaveBeenCalledWith("K1A 0B1", "fr", {
      proximity: undefined,
    });
  });

  it("journalise puis retombe sur le géocodage quand la base échoue", async () => {
    const geocoding = geocodingStub();
    const failure = new Error("Supabase indisponible");
    const postalCodes = postalCodeStub(async () => {
      throw failure;
    });
    const onPostalCodeFailure = vi.fn();

    const places = await searchDestinationPlaces("J2G2W4", "fr", {
      geocoding: geocoding.provider,
      postalCodes: postalCodes.provider,
      onPostalCodeFailure,
    });

    expect(places).toEqual([GEOCODED]);
    expect(onPostalCodeFailure).toHaveBeenCalledWith(failure);
    expect(geocoding.search).toHaveBeenCalledWith("J2G2W4", "fr", {
      proximity: undefined,
    });
  });

  it("laisse les adresses, villes et POI au fournisseur de géocodage", async () => {
    const geocoding = geocodingStub();
    const postalCodes = postalCodeStub(async () => GRANBY);

    for (const query of ["Granby", "12 rue Principale", "J2G", "J2G 2"]) {
      await searchDestinationPlaces(query, "fr", {
        geocoding: geocoding.provider,
        postalCodes: postalCodes.provider,
      });
    }

    expect(postalCodes.find).not.toHaveBeenCalled();
    expect(geocoding.search).toHaveBeenCalledTimes(4);
  });

  it("fonctionne sans base de codes postaux configurée", async () => {
    const geocoding = geocodingStub();

    const places = await searchDestinationPlaces("J2G2W4", "fr", {
      geocoding: geocoding.provider,
      postalCodes: null,
    });

    expect(places).toEqual([GEOCODED]);
    expect(geocoding.search).toHaveBeenCalledWith("J2G2W4", "fr", {
      proximity: undefined,
    });
  });
});
