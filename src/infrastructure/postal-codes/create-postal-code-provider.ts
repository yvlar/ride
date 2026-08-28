import type { PostalCodeProvider } from "@/domain/postal-codes/postal-code-provider";
import { parseEnv, serverProcessEnv } from "@/lib/env";
import { SupabasePostalCodeProvider } from "./supabase-postal-code-provider";

/**
 * FR-040 — construit l’adaptateur de codes postaux lorsque Supabase est
 * configuré côté serveur.
 *
 * Retourne `null` lorsque la base de référence n’est pas branchée : la
 * recherche de destination retombe alors sur le fournisseur de géocodage
 * existant (`FR-032`), sans erreur visible pour l’utilisateur.
 */
export function createPostalCodeProvider(
  source?: Record<string, string | undefined>,
): PostalCodeProvider | null {
  const env = parseEnv(source ?? serverProcessEnv());

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return null;
  }

  return new SupabasePostalCodeProvider(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
