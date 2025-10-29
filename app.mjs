// app.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

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

    // Try to parse the raw text as JSON. Models sometimes wrap JSON inside text; extract first JSON block if needed.
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // extract JSON substring
      const jsonMatch = raw.match(/({[\s\S]*})/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (e2) {
          // fallthrough
        }
      }
    }

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
    
    let latitude = null;
    let longitude = null;
    let postalCode = null;
    
    if (geoData?.features && geoData.features.length > 0) {
      const coords = geoData.features[0]?.geometry?.coordinates;
      if (coords && coords.length === 2) {
        longitude = coords[0];
        latitude = coords[1];
        postalCode = geoData.features[0]?.properties?.postcode || null;
      }
    }

    // If geocoding failed, fallback to ChatGPT for approximate coordinates
    if (!latitude || !longitude) {
      console.log("Geocoding failed, using ChatGPT fallback");
    }

    // Step 2: Get climate data from ChatGPT
    const systemPrompt = `
You are a climate data assistant. When given an address or location, provide monthly temperature and rainfall data.
Return fields exactly as in the schema and valid JSON only (no surrounding text).

Schema (JSON keys):
{
  "address": "<original input>",
  "latitude": <number or null>,
  "longitude": <number or null>,
  "postalCode": <string or null>,
  "monthly_temperatures": [<12 numbers in Celsius, Jan-Dec>],
  "monthly_rainfall": [<12 numbers in mm, Jan-Dec>],
  "confidence": "low|medium|high",
  "source_explanation": "short explanation (<= 50 words)"
}

Important:
- RETURN ONLY JSON, no markdown, no backticks, no commentary.
- monthly_temperatures and monthly_rainfall MUST be arrays of exactly 12 numbers.
- If postal code is provided, use it; otherwise estimate based on the address.
- Provide typical/average climate data for the location.
`;

    const userPrompt = `Postal code: ${postalCode}; Address: "${address.trim()}"${latitude && longitude ? `; Latitude: ${latitude}, Longitude: ${longitude}` : ""}. Provide monthly climate data as JSON.`;
    console.log("User prompt:", userPrompt);

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const climateResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 600,
        temperature: 0.0
      })
    });

    if (!climateResp.ok) {
      const text = await climateResp.text();
      return res.status(502).json({ error: "OpenAI API error", detail: text });
    }

    const climateData = await climateResp.json();
    const raw = climateData?.choices?.[0]?.message?.content;
    
    if (!raw) {
      return res.status(502).json({ error: "Empty response from OpenAI", raw: climateData });
    }

    // Parse JSON response
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const jsonMatch = raw.match(/({[\s\S]*})/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1]);
        } catch (e2) {
          // fallthrough
        }
      }
    }

    if (!parsed) {
      return res.status(200).json({
        warning: "Could not parse model output as JSON. Returning raw output.",
        raw
      });
    }

    // Override with actual geocoded coordinates if available
    if (latitude && longitude) {
      parsed.latitude = latitude;
      parsed.longitude = longitude;
    }

    const out = {
      address: parsed.address || address,
      latitude: parsed.latitude || null,
      longitude: parsed.longitude || null,
      postalCode: parsed.postalCode || null,
      monthly_temperatures: parsed.monthly_temperatures || [],
      monthly_rainfall: parsed.monthly_rainfall || [],
      confidence: parsed.confidence || "low",
      source_explanation: parsed.source_explanation || ""
    };

    return res.json(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "server_error", detail: err.message });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => {
  console.log(`Culture-date-api listening on port ${PORT}`);
});
