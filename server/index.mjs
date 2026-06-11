/**
 * ato-web-capsule server — static SPA + server-side store-API proxy.
 *
 * The browser only ever talks to this origin: the catalog is fetched
 * server-side from API_BASE, which sidesteps CORS and cookie-domain issues
 * no matter where the capsule runs (localhost, a connected runner, managed).
 *
 * Plain node:http on purpose — the Ato node driver may execute through a
 * Node-compat layer (Deno) where http2-dependent server frameworks break;
 * zero runtime dependencies keeps the capsule portable.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
// Explicit node: import — the Ato node driver executes through Deno's
// Node-compat layer, which has no global `process`.
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { buildCatalog, parseCatalogMode } from "./catalog.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const API_BASE = (process.env.API_BASE ?? "https://api.ato.run").replace(/\/$/, "");
const STORE_NAME = process.env.STORE_NAME ?? "Ato Store";
const APP_WEB_BASE = (process.env.APP_WEB_BASE ?? "https://app.ato.run").replace(/\/$/, "");
const STORE_WEB_BASE = (process.env.STORE_WEB_BASE ?? "https://ato.run/store").replace(/\/$/, "");
const MODE = parseCatalogMode(process.env.CATALOG_MODE);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

// Self-heal: a source run without a prior build step still serves the SPA.
function ensureDist() {
  if (existsSync(join(DIST, "index.html"))) return true;
  for (const args of [["install"], ["run", "build"]]) {
    const r = spawnSync("npm", args, { cwd: ROOT, stdio: "inherit", timeout: 300_000 });
    if (r.status !== 0) return false;
  }
  return existsSync(join(DIST, "index.html"));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function sendStatic(res, urlPath) {
  // index.html fallback covers both "/" and unknown SPA paths.
  const relative = urlPath === "/" ? "index.html" : urlPath.slice(1);
  let filePath = resolve(DIST, relative);
  if (!filePath.startsWith(DIST) || !existsSync(filePath)) {
    filePath = join(DIST, "index.html");
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}

async function handle(req, res) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "method_not_allowed" });
  }
  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { status: "ok" });
  }
  if (url.pathname === "/api/config") {
    return sendJson(res, 200, {
      store_name: STORE_NAME,
      catalog_mode: MODE.kind,
      app_web_base: APP_WEB_BASE,
      store_web_base: STORE_WEB_BASE,
    });
  }
  if (url.pathname === "/api/catalog") {
    const result = await buildCatalog({
      apiBase: API_BASE,
      mode: MODE,
      q: url.searchParams.get("q") ?? "",
    });
    return sendJson(res, result.error ? 502 : 200, result);
  }
  if (url.pathname.startsWith("/api/")) {
    return sendJson(res, 404, { error: "unknown_endpoint" });
  }
  return sendStatic(res, url.pathname);
}

if (!ensureDist()) {
  console.error("ato-web-capsule: frontend build missing and self-build failed");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8000);
createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(port, "127.0.0.1", () => {
  console.log(
    `ato-web-capsule (${STORE_NAME}, mode=${MODE.kind}) on http://127.0.0.1:${port}`,
  );
});
