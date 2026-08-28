import { describe, expect, it } from "vitest";
import { createPostalCodeProvider } from "./create-postal-code-provider";
import { SupabasePostalCodeProvider } from "./supabase-postal-code-provider";

describe("createPostalCodeProvider (FR-040, NFR-005)", () => {
  it("construit l’adaptateur Supabase lorsque la base est configurée", () => {
    const provider = createPostalCodeProvider({
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_ANON_KEY: "test-anon-key",
    });

    expect(provider).toBeInstanceOf(SupabasePostalCodeProvider);
  });

  it("reste débranché lorsque l’URL ou la clé manque", () => {
    expect(createPostalCodeProvider({})).toBeNull();
    expect(
      createPostalCodeProvider({ SUPABASE_URL: "https://project.supabase.co" }),
    ).toBeNull();
    expect(createPostalCodeProvider({ SUPABASE_ANON_KEY: "key" })).toBeNull();
    expect(
      createPostalCodeProvider({ SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }),
    ).toBeNull();
  });
});
