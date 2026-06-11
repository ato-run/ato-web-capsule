# ato-web-capsule

A store front you run as a capsule. `ato run -U .` serves a small React SPA
from a zero-dependency `node:http` server that proxies the catalog
**server-side** from the store API — the browser only ever talks to the
capsule's own origin, so it works identically on localhost, a connected
runner, or a managed runner (no CORS, no cookie-domain coupling).

Login-required actions (vouch, publish, manage) deep-link to the hosted store
(`ato.run/store`); Run buttons deep-link into the PWA's Get & Run flow
(`app.ato.run`).

## Run

```sh
ato run -U .
```

Local development:

```sh
npm install
npm run build      # SPA → dist/
npm run serve      # http://127.0.0.1:8000 (or $PORT)
npm run dev        # Vite dev server with /api proxied to :8000
npm test           # server catalog unit tests (node --test)
```

## Launch your own store

Store identity is configuration, not code — the same capsule serves any
store:

| Env | Default | Meaning |
| --- | --- | --- |
| `STORE_NAME` | `Ato Store` | Display name in the header / title |
| `CATALOG_MODE` | `all` | `all` \| `publisher:<handle>` \| `refs:<a/b>,<c/d>` |
| `API_BASE` | `https://api.ato.run` | Store API the catalog is proxied from |
| `APP_WEB_BASE` | `https://app.ato.run` | PWA used by Run deep links |
| `STORE_WEB_BASE` | `https://ato.run/store` | Hosted store for login-required actions |

Examples:

```sh
# Your own storefront: only your published capsules
STORE_NAME="Acme Apps" CATALOG_MODE=publisher:acme ato run -U .

# A curated picks store
STORE_NAME="Editor's Picks" CATALOG_MODE=refs:community/hello-capsule ato run -U .
```

If you point `API_BASE` at a different host, add that host to
`[network].egress_allow` in `capsule.toml`.

## Architecture

```
browser ── same-origin ──> server/index.mjs (node:http, 127.0.0.1:$PORT)
                             ├─ /api/health           readiness
                             ├─ /api/config           store identity for the SPA
                             ├─ /api/catalog?q=…      CATALOG_MODE applied server-side
                             │     └── fetch ──> $API_BASE/v1/capsules[…]  (egress-allowlisted)
                             └─ /*                    dist/ static SPA (+ index.html fallback)
```

Anonymous browse only by design: the public catalog endpoints need no
credentials. Authenticated actions stay on the hosted store until a
device-code + bearer flow is added to the server.
