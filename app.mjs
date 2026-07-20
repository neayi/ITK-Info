// app.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import { parseModelJson, parseGeocodeFeature } from "./lib/parse.mjs";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment.");
  process.exit(1);
}

// Config modèle choisi
const MODEL = "gpt-4o-mini";

/**
 * GET /
 * Health check
 */
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * POST /api/culture
 * body: { culture: "maïs", region: "France (optionnel)" }
 */
app.post("/api/culture", async (req, res) => {
  try {
    const { culture, region } = req.body || {};
    if (!culture || typeof culture !== "string" || culture.trim().length === 0) {
      return res.status(400).json({ error: "Missing or invalid 'culture' in body." });
    }

    // Construire le prompt strict pour forcer un JSON précis
    const systemPrompt = `
You are a helpful agricultural assistant. When asked about a crop, provide a concise factual JSON only (no surrounding text).
Return fields exactly as in the schema described and valid JSON. If uncertain, provide best guess and set "confidence" to "low" or "medium".

If you cannot find relevant data, return empty strings for dates and color_hex, and "low" confidence with explanation. Do not invent data.

Schema (JSON keys):
{
  "culture": "<original input>",
  "region": "<region or empty string>",
  "average_sowing_date": "MM-DD",             // The typical time in the year when this kind of crop is being sowed
  "end_of_season": "MM-DD",                   // The typical time in the year when this kind of crop is harvested
  "color_hex": "#RRGGBB",                     // hex color representing crop
  "confidence": "low|medium|high",
  "source_explanation": "short plain text justification (<= 30 words)"
}

Important:
- RETURN ONLY JSON, no markdown, no backticks, no commentary.
- Dates MUST be in zero-padded two-digit month/day format MM-DD (e.g. 03-15 for 15 March).
- If only month-level known, pick the 15th of that month as the average (e.g. May => 05-15).
- color_hex must be a valid web hex (# followed by 6 hex digits). Prefer colors that intuitively match the crop.
- Keep source_explanation short (<= 30 words) and factual (e.g. "Typical temperate sowing window; crop matures ~90 days").

Answer strictly in JSON following the schema.
`;

    const userPrompt = `Crop: "${culture.trim()}"${region ? `; Region: "${region}"` : ""}. Provide the JSON as requested.`;

    // Build messages for Chat Completions API
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 400,
        temperature: 0.0 // deterministic
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: "OpenAI API error", detail: text });
    }

    const data = await resp.json();

    // The API returns choices[].message.content
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) {
      return res.status(502).json({ error: "Empty response from OpenAI", raw: data });
    }

    // Models sometimes wrap JSON inside text; tolerate that when parsing.
    const parsed = parseModelJson(raw);

    if (!parsed) {
      // fallback: return raw and indicate parse error
      return res.status(200).json({
        warning: "Could not parse model output as JSON. Returning raw output.",
        raw
      });
    }

    // Basic validation & normalization
    const out = {
      culture: parsed.culture || culture,
      region: parsed.region || (region || ""),
      average_sowing_date: parsed.average_sowing_date || "",
      end_of_season: parsed.end_of_season || "",
      color_hex: parsed.color_hex || "",
      confidence: parsed.confidence || "low",
      source_explanation: parsed.source_explanation || ""
    };

    return res.json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error", detail: err.message });
  }
});

/**
 * POST /api/location
 * body: { address: "string" }
 * Returns: { address, latitude, longitude, monthly_temperatures: [], monthly_rainfall: [], confidence, source_explanation }
 */
app.post("/api/location", async (req, res) => {
  try {
    const { address } = req.body || {};
    if (!address || typeof address !== "string" || address.trim().length === 0) {
      return res.status(400).json({ error: "Missing or invalid 'address' in body." });
    }

    // Step 1: Geocode using French Government Address API
    const geocodeUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address.trim())}`;
    
    console.log("Geocoding URL:", geocodeUrl);

    const geoResp = await fetch(geocodeUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    console.log("Geocoding response status:", geoResp.status);

    if (!geoResp.ok) {
      return res.status(502).json({ error: "Geocoding API error", detail: await geoResp.text() });
    }

    const geoData = await geoResp.json();

    const { latitude, longitude, postalCode, city, department, region, country } =
      parseGeocodeFeature(geoData?.features?.[0]);

    // Without coordinates we cannot query NASA POWER for climate data.
    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Could not geocode address; no coordinates found." });
    }

    // Step 2: Get climate data from NASA POWER climatology API
    const nasaUrl = new URL("https://power.larc.nasa.gov/api/temporal/climatology/point");
    nasaUrl.searchParams.set("parameters", "T2M,PRECTOTCORR_SUM");
    nasaUrl.searchParams.set("community", "AG");
    nasaUrl.searchParams.set("longitude", longitude.toString());
    nasaUrl.searchParams.set("latitude", latitude.toString());
    nasaUrl.searchParams.set("format", "JSON");
    nasaUrl.searchParams.set("units", "metric");
    nasaUrl.searchParams.set("start", "2018");
    nasaUrl.searchParams.set("end", "2024"); // La date de fin peut être obtenue dynamiquement via l'API : https://power.larc.nasa.gov/api/temporal/climatology/configuration

    const nasaResp = await fetch(nasaUrl.toString());

    if (!nasaResp.ok) {
      const text = await nasaResp.text();
      return res.status(502).json({ error: "NASA POWER API error", detail: text });
    }

    const nasaData = await nasaResp.json();

    const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const t2m = nasaData?.properties?.parameter?.T2M;
    const precip = nasaData?.properties?.parameter?.PRECTOTCORR_SUM;

    if (!t2m || !precip) {
      return res.status(502).json({ error: "Unexpected NASA POWER API response", raw: nasaData });
    }

    const out = {
      address: address.trim(),
      latitude,
      longitude,
      postalCode: postalCode || null,
      city: city || "",
      department: department || "",
      region: region || "",
      country: country || "",
      monthly_temperatures: MONTHS.map((m) => t2m[m]),
      monthly_rainfall: MONTHS.map((m) => precip[m]),
      confidence: "high",
      source_explanation: "NASA POWER climatology (community=AG, 2018-2024 average)."
    };

    return res.json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error", detail: err.message });
  }
});

const PORT = process.env.PORT || 80;

// Only auto-start the server when this file is run directly (`node app.mjs`),
// so it can be imported in tests without binding to a real port.
const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  app.listen(PORT, () => {
    console.log(`Culture-date-api listening on port ${PORT}`);
  });
}

export default app;
