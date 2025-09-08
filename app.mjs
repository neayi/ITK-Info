// app.js
import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch"; // si Node 18+ et sans node-fetch, utiliser global fetch
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
const MODEL = "gpt-4o-mini"; // recommandé pour bon ratio coût/qualité pour tâches textuelles. :contentReference[oaicite:1]{index=1}

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Culture-date-api listening on ${PORT}`);
});
