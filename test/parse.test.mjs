import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson, parseGeocodeFeature } from "../lib/parse.mjs";

test("parseModelJson parses a plain JSON string", () => {
  const result = parseModelJson('{"confidence":"high"}');
  assert.deepEqual(result, { confidence: "high" });
});

test("parseModelJson extracts JSON wrapped in surrounding prose", () => {
  const raw = 'Sure, here you go:\n```json\n{"culture":"maïs"}\n```\nHope this helps!';
  const result = parseModelJson(raw);
  assert.deepEqual(result, { culture: "maïs" });
});

test("parseModelJson returns null when no JSON object can be found", () => {
  assert.equal(parseModelJson("not json at all"), null);
});

test("parseModelJson returns null for non-string input", () => {
  assert.equal(parseModelJson(undefined), null);
  assert.equal(parseModelJson(null), null);
});

test("parseGeocodeFeature returns nulls when no feature is given", () => {
  assert.deepEqual(parseGeocodeFeature(undefined), {
    latitude: null,
    longitude: null,
    postalCode: null,
    city: null,
    department: null,
    region: null,
    country: null
  });
});

test("parseGeocodeFeature extracts city/department/region/country from a real-shaped feature", () => {
  // Shape returned by api-adresse.data.gouv.fr for "8 bd du port 75001 Paris"
  const feature = {
    geometry: { coordinates: [2.333673, 48.859824] },
    properties: {
      postcode: "75001",
      city: "Paris",
      context: "75, Paris, Île-de-France"
    }
  };

  const result = parseGeocodeFeature(feature);
  assert.equal(result.latitude, 48.859824);
  assert.equal(result.longitude, 2.333673);
  assert.equal(result.postalCode, "75001");
  assert.equal(result.city, "Paris");
  assert.equal(result.department, "Paris");
  assert.equal(result.region, "Île-de-France");
  assert.equal(result.country, "France");
});

test("parseGeocodeFeature leaves department/region/country empty when context is missing", () => {
  const feature = {
    geometry: { coordinates: [4.835, 45.758] },
    properties: { postcode: "69001", city: "Lyon" }
  };

  const result = parseGeocodeFeature(feature);
  assert.equal(result.city, "Lyon");
  assert.equal(result.department, null);
  assert.equal(result.region, null);
  assert.equal(result.country, "France");
});

test("parseGeocodeFeature does not set country when there is no city (no match)", () => {
  const feature = { geometry: { coordinates: [0, 0] }, properties: {} };
  const result = parseGeocodeFeature(feature);
  assert.equal(result.city, null);
  assert.equal(result.country, null);
});
