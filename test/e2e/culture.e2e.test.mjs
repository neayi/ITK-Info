// End-to-end test for the real, running service.
//
// Unlike the tests in test/, this one does NOT import app.mjs. It assumes the
// app is already up (e.g. `docker-compose up -d`), listening on BASE_URL
// (default http://localhost, matching the docker-compose "80:80" mapping),
// with its own OPENAI_API_KEY configured — this test never needs to know
// that key, it only talks HTTP.
//
// Run with: npm run test:e2e
// Override target with: BASE_URL=http://localhost:3000 npm run test:e2e

import { test, before } from "node:test";
import assert from "node:assert/strict";

const BASE_URL = process.env.BASE_URL || "http://localhost";
const SKIP_REASON = `No server responding on ${BASE_URL} — start it first with "docker-compose up -d".`;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const MM_DD_RE = /^\d{2}-\d{2}$/;

let serverReachable = false;

before(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/culture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    // Any HTTP response (even the expected 400 for a missing body) proves the
    // server is up; only a connection failure means it isn't.
    serverReachable = typeof res.status === "number";
  } catch (e) {
    serverReachable = false;
  }
});

test("POST /api/culture returns sowing/harvest/color data for a known crop", async (t) => {
  if (!serverReachable) {
    t.skip(SKIP_REASON);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/culture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ culture: "maïs", region: "France" })
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  // Everything here comes from the model, so only check shape/plausibility,
  // not exact values.
  assert.equal(body.culture, "maïs");
  assert.equal(body.region, "France");
  assert.match(body.average_sowing_date, MM_DD_RE, `unexpected average_sowing_date: ${body.average_sowing_date}`);
  assert.match(body.end_of_season, MM_DD_RE, `unexpected end_of_season: ${body.end_of_season}`);
  assert.match(body.color_hex, HEX_COLOR_RE, `unexpected color_hex: ${body.color_hex}`);
  assert.ok(["low", "medium", "high"].includes(body.confidence));
  assert.equal(typeof body.source_explanation, "string");
  assert.ok(body.source_explanation.length > 0);
});

test("POST /api/culture without a region still returns a valid response", async (t) => {
  if (!serverReachable) {
    t.skip(SKIP_REASON);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/culture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ culture: "wheat" })
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.culture, "wheat");
  assert.match(body.average_sowing_date, MM_DD_RE, `unexpected average_sowing_date: ${body.average_sowing_date}`);
  assert.match(body.end_of_season, MM_DD_RE, `unexpected end_of_season: ${body.end_of_season}`);
  assert.match(body.color_hex, HEX_COLOR_RE, `unexpected color_hex: ${body.color_hex}`);
  assert.ok(["low", "medium", "high"].includes(body.confidence));
});

test("POST /api/culture without a culture returns 400 on the live server", async (t) => {
  if (!serverReachable) {
    t.skip(SKIP_REASON);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/culture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
});
