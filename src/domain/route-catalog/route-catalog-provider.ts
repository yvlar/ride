import type {
  RouteCatalogDetail,
  RouteCatalogFilter,
  RouteCatalogGpx,
  RouteCatalogPage,
  RouteCatalogLocale,
} from "./types";

export type RouteCatalogProvider = {
  list(filter?: RouteCatalogFilter): Promise<RouteCatalogPage>;
  find(slug: string, locale?: RouteCatalogLocale): Promise<RouteCatalogDetail | null>;
  getGpx(slug: string): Promise<RouteCatalogGpx | null>;
};
