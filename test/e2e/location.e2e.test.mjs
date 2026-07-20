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

let serverReachable = false;

before(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/location`, {
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

test("POST /api/location returns full location + climate data for a known Paris address", async (t) => {
  if (!serverReachable) {
    t.skip(SKIP_REASON);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: "8 bd du port 75001 Paris" })
  });

  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.address, "8 bd du port 75001 Paris");

  // These come from the real geocoding API (api-adresse.data.gouv.fr), not
  // from the model, so they must be exact / tightly bounded.
  assert.ok(Math.abs(body.latitude - 48.86) < 0.5, `unexpected latitude: ${body.latitude}`);
  assert.ok(Math.abs(body.longitude - 2.33) < 0.5, `unexpected longitude: ${body.longitude}`);
  assert.equal(body.postalCode, "75001");
  assert.equal(body.city, "Paris");
  assert.equal(body.department, "Paris");
  assert.equal(body.region, "Île-de-France");
  assert.equal(body.country, "France");

  // These come from the model, so only check shape/plausibility, not exact values.
  assert.ok(Array.isArray(body.monthly_temperatures));
  assert.equal(body.monthly_temperatures.length, 12);
  for (const value of body.monthly_temperatures) {
    assert.equal(typeof value, "number");
  }

  assert.ok(Array.isArray(body.monthly_rainfall));
  assert.equal(body.monthly_rainfall.length, 12);
  for (const value of body.monthly_rainfall) {
    assert.equal(typeof value, "number");
    assert.ok(value >= 0, `rainfall should not be negative: ${value}`);
  }

  assert.ok(["low", "medium", "high"].includes(body.confidence));
});

test("POST /api/location without an address returns 400 on the live server", async (t) => {
  if (!serverReachable) {
    t.skip(SKIP_REASON);
    return;
  }

  const res = await fetch(`${BASE_URL}/api/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
});
