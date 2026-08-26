import { describe, expect, it, vi } from "vitest";
import {
  createPostalCodeTableFetch,
  POSTAL_CODE_FIXTURES,
} from "@/test/postal-code-fixtures";
import { SupabasePostalCodeProvider } from "./supabase-postal-code-provider";

const BASE_URL = "https://project.supabase.co";
const API_KEY = "test-anon-key";

describe("SupabasePostalCodeProvider (FR-040)", () => {
  it("résout un code postal connu, quelle que soit la forme saisie", async () => {
    const provider = new SupabasePostalCodeProvider(BASE_URL, API_KEY, {
      fetcher: createPostalCodeTableFetch(),
    });

    const compact = await provider.find("J2G2W4");
    const spaced = await provider.find("j2g 2w4");

    expect(compact).toEqual({
      postalCode: "J2G2W4",
      latitude: 45.4008,
      longitude: -72.7331,
      municipality: "Granby",
      region: "QC",
    });
    expect(spaced).toEqual(compact);
  });

  it("interroge la clé primaire par égalité exacte, sans LIKE ni table complète", async () => {
    const fetcher = vi.fn(createPostalCodeTableFetch());
    const provider = new SupabasePostalCodeProvider(BASE_URL, API_KEY, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    await provider.find("J2G 2W4");

    const [request, init] = fetcher.mock.calls[0] ?? [];
    const url = new URL(String(request));
    expect(url.pathname).toBe("/rest/v1/postal_codes_quebec");
    expect(url.searchParams.get("postal_code")).toBe("eq.J2G2W4");
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("select")).toBe(
      "postal_code,latitude,longitude,municipality",
    );
    expect(url.search).not.toContain("like");
    expect(
      (init?.headers as Record<string, string> | undefined)?.apikey,
    ).toBe(API_KEY);
  });

  it("retourne null pour un code postal absent de la table", async () => {
    const provider = new SupabasePostalCodeProvider(BASE_URL, API_KEY, {
      fetcher: createPostalCodeTableFetch(),
    });

    await expect(provider.find("K1A0B1")).resolves.toBeNull();
  });

  it("n’appelle pas la base pour une saisie qui n’est pas un code postal", async () => {
    const fetcher = vi.fn(createPostalCodeTableFetch());
    const provider = new SupabasePostalCodeProvider(BASE_URL, API_KEY, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    await expect(provider.find("Granby")).resolves.toBeNull();
    await expect(provider.find("J2G")).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lève une erreur lorsque Supabase répond en échec", async () => {
    const provider = new SupabasePostalCodeProvider(BASE_URL, API_KEY, {
      fetcher: (async () =>
        Response.json({ message: "boom" }, { status: 500 })) as typeof fetch,
    });

    await expect(provider.find("J2G2W4")).rejects.toThrow(/500/);
  });

  it("lève une erreur lorsque la réponse est illisible", async () => {
    const provider = new SupabasePostalCodeProvider(BASE_URL, API_KEY, {
      fetcher: (async () =>
        Response.json({ unexpected: true })) as typeof fetch,
    });

    await expect(provider.find("J2G2W4")).rejects.toThrow(
      /Réponse de code postal invalide/,
    );
  });

  it("couvre les municipalités représentatives du jeu d’essai", async () => {
    const provider = new SupabasePostalCodeProvider(BASE_URL, API_KEY, {
      fetcher: createPostalCodeTableFetch(),
    });

    const found = await Promise.all(
      POSTAL_CODE_FIXTURES.map((row) => provider.find(row.postal_code)),
    );

    expect(found.map((location) => location?.municipality)).toEqual([
      "Granby",
      "Roxton Pond",
      "Sherbrooke",
    ]);
  });
});
