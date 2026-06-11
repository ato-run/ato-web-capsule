/**
 * Catalog assembly — the only place that talks to the store API.
 *
 * The SPA consumes the normalized shape returned here, never the upstream
 * API directly, so any store (official, per-publisher, curated) is just a
 * different CATALOG_MODE over the same code.
 */

/**
 * CATALOG_MODE grammar:
 *   "all"                      — every public capsule (the official store)
 *   "publisher:<handle>"       — one publisher's storefront
 *   "refs:<a/b>,<c/d>"         — a curated list of scoped refs
 */
export function parseCatalogMode(raw) {
  const mode = (raw ?? "all").trim();
  if (mode.startsWith("publisher:")) {
    const handle = mode.slice("publisher:".length).trim().toLowerCase();
    if (handle) return { kind: "publisher", handle };
  }
  if (mode.startsWith("refs:")) {
    const refs = mode
      .slice("refs:".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (refs.length > 0) return { kind: "refs", refs };
  }
  return { kind: "all" };
}

/** Normalize an upstream capsule (list or detail shape) for the SPA. */
export function normalizeCapsule(raw) {
  if (!raw || typeof raw !== "object") return null;
  const scopedId =
    typeof raw.scoped_id === "string" && raw.scoped_id
      ? raw.scoped_id
      : raw.publisher && typeof raw.publisher.handle === "string" && typeof raw.slug === "string"
        ? `${raw.publisher.handle}/${raw.slug}`
        : null;
  if (!scopedId) return null;
  return {
    scoped_id: scopedId,
    name: typeof raw.name === "string" && raw.name ? raw.name : scopedId.split("/").pop(),
    description: typeof raw.description === "string" ? raw.description : "",
    icon:
      typeof raw.icon === "string" && raw.icon
        ? raw.icon
        : typeof raw.store_icon === "string" && raw.store_icon
          ? raw.store_icon
          : null,
    category: typeof raw.category === "string" ? raw.category : "other",
    publisher_handle: raw.publisher?.handle ?? scopedId.split("/")[0],
    publisher_verified: Boolean(raw.publisher?.verified),
    vouches_count:
      typeof raw.vouches_count === "number"
        ? raw.vouches_count
        : typeof raw.vouchesCount === "number"
          ? raw.vouchesCount
          : 0,
  };
}

/**
 * Fetch + filter the catalog for the configured mode. Always resolves; an
 * upstream failure yields `{ capsules: [], error: "upstream_unavailable" }`
 * so the SPA can show an honest empty state.
 */
export async function buildCatalog({ apiBase, mode, q, fetchImpl = fetch }) {
  const base = apiBase.replace(/\/$/, "");
  try {
    if (mode.kind === "refs") {
      const results = await Promise.all(
        mode.refs.map(async (ref) => {
          const res = await fetchImpl(`${base}/v1/capsules/by/${ref}`, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) return null;
          return normalizeCapsule(await res.json());
        }),
      );
      let capsules = results.filter(Boolean);
      if (q) {
        const needle = q.toLowerCase();
        capsules = capsules.filter(
          (c) =>
            c.name.toLowerCase().includes(needle) ||
            c.description.toLowerCase().includes(needle),
        );
      }
      return { capsules };
    }

    const url = new URL(`${base}/v1/capsules`);
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("limit", mode.kind === "publisher" ? "50" : "20");
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { capsules: [], error: "upstream_unavailable" };
    const body = await res.json();
    let capsules = (Array.isArray(body.capsules) ? body.capsules : [])
      .map(normalizeCapsule)
      .filter(Boolean);
    if (mode.kind === "publisher") {
      capsules = capsules.filter(
        (c) => c.publisher_handle.toLowerCase() === mode.handle,
      );
    }
    return { capsules };
  } catch {
    return { capsules: [], error: "upstream_unavailable" };
  }
}
