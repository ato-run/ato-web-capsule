import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CONFIG,
  fetchCatalog,
  fetchConfig,
  runUrl,
  storePageUrl,
  type CatalogCapsule,
  type StoreConfig,
} from "./api/client";

function monogram(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function CapsuleIcon({ capsule }: { capsule: CatalogCapsule }) {
  return capsule.icon ? (
    <img className="capsule-icon" src={capsule.icon} alt="" loading="lazy" draggable={false} />
  ) : (
    <span className="capsule-icon capsule-monogram" aria-hidden="true">
      {monogram(capsule.name)}
    </span>
  );
}

function CapsuleDetail({
  capsule,
  config,
  onClose,
}: {
  capsule: CatalogCapsule;
  config: StoreConfig;
  onClose: () => void;
}) {
  return (
    <div className="detail-backdrop" onClick={onClose} role="presentation">
      <aside className="detail" onClick={(e) => e.stopPropagation()} aria-label={capsule.name}>
        <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <header className="detail-head">
          <CapsuleIcon capsule={capsule} />
          <div>
            <h2>{capsule.name}</h2>
            <p className="detail-publisher">
              {capsule.publisher_handle}
              {capsule.publisher_verified && (
                <span className="badge badge-verified" title="Verified publisher">
                  ✓ verified
                </span>
              )}
            </p>
          </div>
        </header>
        {capsule.description && <p className="detail-desc">{capsule.description}</p>}
        <dl className="detail-meta">
          <div>
            <dt>Category</dt>
            <dd>{capsule.category}</dd>
          </div>
          <div>
            <dt>Vouches</dt>
            <dd>{capsule.vouches_count}</dd>
          </div>
        </dl>
        <div className="detail-actions">
          <a className="btn btn-primary" href={runUrl(config, capsule.scoped_id)}>
            Run
          </a>
          {/* Login-required actions (vouch, report, publish) live on the hosted store. */}
          <a
            className="btn"
            href={storePageUrl(config, capsule.scoped_id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View in Store ↗
          </a>
        </div>
      </aside>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_CONFIG);
  const [capsules, setCapsules] = useState<CatalogCapsule[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<CatalogCapsule | null>(null);

  useEffect(() => {
    void fetchConfig().then(setConfig);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const timer = setTimeout(() => {
      void fetchCatalog(query).then((result) => {
        if (cancelled) return;
        setCapsules(result.capsules);
        setStatus(result.error ? "error" : "ready");
      });
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    document.title = config.store_name;
  }, [config.store_name]);

  const subtitle = useMemo(() => {
    if (config.catalog_mode === "publisher") return "Publisher storefront";
    if (config.catalog_mode === "refs") return "Curated selection";
    return "Apps you can run anywhere";
  }, [config.catalog_mode]);

  return (
    <div className="store">
      <header className="store-head">
        <h1>{config.store_name}</h1>
        <p className="store-subtitle">{subtitle}</p>
        <input
          className="store-search"
          type="search"
          placeholder="Search apps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search apps"
        />
      </header>

      {status === "loading" && <p className="store-note">Loading…</p>}
      {status === "error" && (
        <p className="store-note">The store API is unreachable right now. Try again shortly.</p>
      )}
      {status === "ready" && capsules.length === 0 && (
        <p className="store-note">{query ? `No apps match “${query}”.` : "No apps published yet."}</p>
      )}

      <main className="capsule-grid">
        {capsules.map((capsule) => (
          <button
            key={capsule.scoped_id}
            type="button"
            className="capsule-card"
            onClick={() => setSelected(capsule)}
            aria-label={`Open ${capsule.name}`}
          >
            <CapsuleIcon capsule={capsule} />
            <span className="capsule-name">{capsule.name}</span>
            <span className="capsule-publisher">
              {capsule.publisher_handle}
              {capsule.publisher_verified && <span className="badge badge-verified">✓</span>}
            </span>
            {capsule.description && <span className="capsule-desc">{capsule.description}</span>}
          </button>
        ))}
      </main>

      {selected && (
        <CapsuleDetail capsule={selected} config={config} onClose={() => setSelected(null)} />
      )}

      <footer className="store-foot">
        <a href={config.store_web_base} target="_blank" rel="noopener noreferrer">
          Publish your app on the Store ↗
        </a>
      </footer>
    </div>
  );
}
