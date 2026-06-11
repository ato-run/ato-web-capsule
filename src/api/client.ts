/**
 * Client for the capsule's own server (same origin) — never the store API
 * directly. The server applies CATALOG_MODE and normalizes shapes.
 */

export interface StoreConfig {
  store_name: string;
  catalog_mode: "all" | "publisher" | "refs";
  app_web_base: string;
  store_web_base: string;
}

export interface CatalogCapsule {
  scoped_id: string;
  name: string;
  description: string;
  icon: string | null;
  category: string;
  publisher_handle: string;
  publisher_verified: boolean;
  vouches_count: number;
}

export interface CatalogResult {
  capsules: CatalogCapsule[];
  error?: string;
}

export const DEFAULT_CONFIG: StoreConfig = {
  store_name: "Ato Store",
  catalog_mode: "all",
  app_web_base: "https://app.ato.run",
  store_web_base: "https://ato.run/store",
};

export async function fetchConfig(): Promise<StoreConfig> {
  try {
    const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!res.ok) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...((await res.json()) as Partial<StoreConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function fetchCatalog(q: string): Promise<CatalogResult> {
  try {
    const url = q ? `/api/catalog?q=${encodeURIComponent(q)}` : "/api/catalog";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const body = (await res.json()) as CatalogResult;
    return { capsules: body.capsules ?? [], error: body.error };
  } catch {
    return { capsules: [], error: "unreachable" };
  }
}

/** Deep link into the PWA's Get & Run flow. */
export function runUrl(config: StoreConfig, scopedId: string): string {
  return `${config.app_web_base}/#route=/run&source=${encodeURIComponent(scopedId)}`;
}

/** The hosted store page (login-required actions like vouch/apply live there). */
export function storePageUrl(config: StoreConfig, scopedId: string): string {
  return `${config.store_web_base}/${scopedId}`;
}
