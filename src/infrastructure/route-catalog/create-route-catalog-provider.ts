import type { RouteCatalogProvider } from "@/domain/route-catalog/route-catalog-provider";
import { parseEnv, serverProcessEnv } from "@/lib/env";
import { SupabaseRouteCatalogProvider } from "./supabase-route-catalog-provider";

/** Le catalogue utilise la même configuration Supabase serveur que les codes postaux. */
export function createRouteCatalogProvider(
  source?: Record<string, string | undefined>,
): RouteCatalogProvider | null {
  const env = parseEnv(source ?? serverProcessEnv());
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return null;
  }
  return new SupabaseRouteCatalogProvider(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
