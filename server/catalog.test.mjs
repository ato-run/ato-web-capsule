import test from "node:test";
import assert from "node:assert/strict";

import { buildCatalog, normalizeCapsule, parseCatalogMode } from "./catalog.mjs";

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body };
}

test("parseCatalogMode grammar", () => {
  assert.deepEqual(parseCatalogMode(undefined), { kind: "all" });
  assert.deepEqual(parseCatalogMode("all"), { kind: "all" });
  assert.deepEqual(parseCatalogMode("publisher:Acme "), { kind: "publisher", handle: "acme" });
  assert.deepEqual(parseCatalogMode("refs:a/b, c/d ,"), { kind: "refs", refs: ["a/b", "c/d"] });
  // Degenerate values fall back to "all" rather than an empty store.
  assert.deepEqual(parseCatalogMode("publisher:"), { kind: "all" });
  assert.deepEqual(parseCatalogMode("refs:"), { kind: "all" });
});

test("normalizeCapsule maps list/detail shapes and rejects junk", () => {
  const fromList = normalizeCapsule({
    scoped_id: "community/hello-capsule",
    name: "Hello Capsule",
    description: "demo",
    icon: "https://x/i.png",
    category: "tools",
    publisher: { handle: "community", verified: false },
    vouches_count: 3,
  });
  assert.equal(fromList.scoped_id, "community/hello-capsule");
  assert.equal(fromList.icon, "https://x/i.png");
  assert.equal(fromList.vouches_count, 3);

  const fromDetail = normalizeCapsule({
    slug: "widget",
    name: "Widget",
    store_icon: "https://x/s.png",
    publisher: { handle: "acme", verified: true },
    vouchesCount: 7,
  });
  assert.equal(fromDetail.scoped_id, "acme/widget");
  assert.equal(fromDetail.icon, "https://x/s.png");
  assert.equal(fromDetail.publisher_verified, true);
  assert.equal(fromDetail.vouches_count, 7);

  assert.equal(normalizeCapsule(null), null);
  assert.equal(normalizeCapsule({ name: "no ref" }), null);
});

test("buildCatalog all-mode passes q through and normalizes", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return jsonResponse({
      capsules: [
        { scoped_id: "a/one", name: "One", publisher: { handle: "a" } },
        { junk: true },
      ],
    });
  };
  const result = await buildCatalog({
    apiBase: "https://api.test/",
    mode: { kind: "all" },
    q: "hello",
    fetchImpl,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/api\.test\/v1\/capsules\?q=hello/);
  assert.deepEqual(result.capsules.map((c) => c.scoped_id), ["a/one"]);
});

test("buildCatalog publisher-mode filters to the handle", async () => {
  const fetchImpl = async () =>
    jsonResponse({
      capsules: [
        { scoped_id: "acme/one", name: "One", publisher: { handle: "Acme" } },
        { scoped_id: "other/two", name: "Two", publisher: { handle: "other" } },
      ],
    });
  const result = await buildCatalog({
    apiBase: "https://api.test",
    mode: { kind: "publisher", handle: "acme" },
    q: "",
    fetchImpl,
  });
  assert.deepEqual(result.capsules.map((c) => c.scoped_id), ["acme/one"]);
});

test("buildCatalog refs-mode fetches each ref and applies q locally", async () => {
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith("/v1/capsules/by/a/one")) {
      return jsonResponse({ scoped_id: "a/one", name: "Alpha", publisher: { handle: "a" } });
    }
    if (u.endsWith("/v1/capsules/by/b/two")) {
      return jsonResponse({ scoped_id: "b/two", name: "Beta", publisher: { handle: "b" } });
    }
    return jsonResponse({}, false);
  };
  const mode = { kind: "refs", refs: ["a/one", "b/two", "c/missing"] };
  const all = await buildCatalog({ apiBase: "https://api.test", mode, q: "", fetchImpl });
  assert.deepEqual(all.capsules.map((c) => c.scoped_id), ["a/one", "b/two"]);

  const filtered = await buildCatalog({ apiBase: "https://api.test", mode, q: "beta", fetchImpl });
  assert.deepEqual(filtered.capsules.map((c) => c.scoped_id), ["b/two"]);
});

test("buildCatalog reports upstream failure honestly", async () => {
  const result = await buildCatalog({
    apiBase: "https://api.test",
    mode: { kind: "all" },
    q: "",
    fetchImpl: async () => {
      throw new Error("down");
    },
  });
  assert.deepEqual(result.capsules, []);
  assert.equal(result.error, "upstream_unavailable");
});
