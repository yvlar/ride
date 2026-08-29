import type { RouteCatalogProvider } from "@/domain/route-catalog/route-catalog-provider";
import { createRouteCatalogProvider } from "./create-route-catalog-provider";

export function getRouteCatalogProvider(): RouteCatalogProvider | null {
  return createRouteCatalogProvider();
}
