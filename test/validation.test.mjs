import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// app.mjs exits at import time if OPENAI_API_KEY is missing; set a dummy value
// before importing it. These tests only exercise input validation, which is
// checked before any OpenAI call is made, so no real key is needed.
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";

const { default: app } = await import("../app.mjs");

let server;
let baseUrl;

before(() => {
  server = app.listen(0);
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

test("POST /api/culture without a culture returns 400", async () => {
  const res = await fetch(`${baseUrl}/api/culture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /culture/i);
});

test("POST /api/culture with a blank culture returns 400", async () => {
  const res = await fetch(`${baseUrl}/api/culture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ culture: "   " })
  });
  assert.equal(res.status, 400);
});

test("POST /api/location without an address returns 400", async () => {
  const res = await fetch(`${baseUrl}/api/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /address/i);
});

test("POST /api/location with a non-string address returns 400", async () => {
  const res = await fetch(`${baseUrl}/api/location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: 12345 })
  });
  assert.equal(res.status, 400);
});
