import { Router, type IRouter, Request, Response } from "express";
import { db, citiesTable, weatherDataTable, heatPredictionsTable, recommendationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

// ─── Intent detection: figure out what the user wants ───────────────────────
interface DetectedIntent {
  type: "map" | "chart" | "report" | "forecast" | "comparison" | "recommendations" | "heatzone" | "weather" | "overview" | "general";
  cityId?: number;
  cityName?: string;
  chartType?: string;
}

async function detectIntent(userMessage: string, contextCityId?: number): Promise<DetectedIntent> {
  const msg = userMessage.toLowerCase();

  // Look up city from message
  const allCities = await db.select().from(citiesTable);
  let matchedCity = allCities.find(c => msg.includes(c.name.toLowerCase()));

  // Fallback to context city
  const cityId = matchedCity?.id ?? contextCityId ?? undefined;
  const cityName = matchedCity?.name ?? undefined;

  // Detect intents
  if (msg.match(/\b(report|full analysis|complete analytics|generate report|detailed report|full report)\b/)) {
    return { type: "report", cityId, cityName };
  }
  if (msg.match(/\b(map|geospatial|location|satellite)\b/)) {
    return { type: "map", cityId, cityName };
  }
  if (msg.match(/\b(compar|ranking|rank|versus|vs)\b/)) {
    return { type: "comparison", cityId, cityName };
  }
  if (msg.match(/\b(forecast|5.day|five.day|next.*days|upcoming)\b/)) {
    return { type: "forecast", cityId, cityName };
  }
  if (msg.match(/\b(trend|history|historical|past|graph|chart|temperature trend|temp trend)\b/)) {
    return { type: "chart", cityId, cityName };
  }
  if (msg.match(/\b(recommend|suggestion|reduc|solution|cool|action|mitigation)\b/)) {
    return { type: "recommendations", cityId, cityName };
  }
  if (msg.match(/\b(heat.*score|heat.*zone|heat.*risk|heat.*index|urban heat)\b/)) {
    return { type: "heatzone", cityId, cityName };
  }
  if (msg.match(/\b(weather|temperature|humidity|wind|rain|current)\b/)) {
    return { type: "weather", cityId, cityName };
  }
  if (msg.match(/\b(overview|summary|all cities|platform|dashboard)\b/)) {
    return { type: "overview", cityId, cityName };
  }

  return { type: "general", cityId, cityName };
}

// ─── Data fetcher: pre-fetch relevant data ──────────────────────────────────
async function fetchContextData(intent: DetectedIntent): Promise<{ data: any; renderTags: string[] }> {
  const renderTags: string[] = [];
  let data: any = {};

  try {
    const BASE = "http://127.0.0.1:5000/api";

    switch (intent.type) {
      case "report": {
        if (intent.cityId) {
          const [dsResp, fcResp, recResp] = await Promise.all([
            fetch(`${BASE}/datasets/city/${intent.cityId}`),
            fetch(`${BASE}/forecast/${intent.cityId}`),
            fetch(`${BASE}/recommendations/${intent.cityId}`)
          ]);
          data.dataset = await dsResp.json() as any;
          data.forecast = await fcResp.json() as any;
          data.recommendations = await recResp.json() as any;
          renderTags.push(`[RENDER_REPORT:${intent.cityId}]`);
        } else {
          const resp = await fetch(`${BASE}/datasets/overview`);
          data.overview = await resp.json() as any;
          renderTags.push("[RENDER_MAP:all]");
          renderTags.push("[RENDER_CHART:city_comparison:all]");
        }
        break;
      }
      case "map": {
        if (intent.cityId) {
          const resp = await fetch(`${BASE}/heatzone/predict/${intent.cityId}`);
          data.heatzone = await resp.json() as any;
          renderTags.push(`[RENDER_MAP:${intent.cityId}]`);
        } else {
          const resp = await fetch(`${BASE}/heatzone/all`);
          data.allHeatzones = await resp.json() as any;
          renderTags.push("[RENDER_MAP:all]");
        }
        break;
      }
      case "comparison": {
        const [hzResp, fcResp] = await Promise.all([
          fetch(`${BASE}/heatzone/all`),
          fetch(`${BASE}/forecast/all/compare`)
        ]);
        data.allHeatzones = await hzResp.json() as any;
        data.allForecasts = await fcResp.json() as any;
        renderTags.push("[RENDER_CHART:city_comparison:all]");
        renderTags.push("[RENDER_CHART:temperature_ranking:all]");
        break;
      }
      case "forecast": {
        if (intent.cityId) {
          const resp = await fetch(`${BASE}/forecast/${intent.cityId}`);
          data.forecast = await resp.json() as any;
          renderTags.push(`[RENDER_CHART:forecast:${intent.cityId}]`);
          renderTags.push(`[RENDER_CARD:forecast_table:${intent.cityId}]`);
        } else {
          const resp = await fetch(`${BASE}/forecast/all/compare`);
          data.allForecasts = await resp.json() as any;
          renderTags.push("[RENDER_CHART:temperature_ranking:all]");
        }
        break;
      }
      case "chart": {
        if (intent.cityId) {
          const [wResp, hResp] = await Promise.all([
            fetch(`${BASE}/weather/history/${intent.cityId}?limit=15`),
            fetch(`${BASE}/heatzone/history/${intent.cityId}?limit=15`)
          ]);
          data.weatherHistory = await wResp.json() as any;
          data.heatHistory = await hResp.json() as any;
          renderTags.push(`[RENDER_CHART:temperature_trend:${intent.cityId}]`);
          renderTags.push(`[RENDER_CHART:heat_trend:${intent.cityId}]`);
        } else {
          const resp = await fetch(`${BASE}/heatzone/all`);
          data.allHeatzones = await resp.json() as any;
          renderTags.push("[RENDER_CHART:city_comparison:all]");
        }
        break;
      }
      case "recommendations": {
        if (intent.cityId) {
          const [recResp, hzResp] = await Promise.all([
            fetch(`${BASE}/recommendations/${intent.cityId}`),
            fetch(`${BASE}/heatzone/predict/${intent.cityId}`)
          ]);
          data.recommendations = await recResp.json() as any;
          data.heatzone = await hzResp.json() as any;
          renderTags.push(`[RENDER_CARD:recommendations:${intent.cityId}]`);
        }
        break;
      }
      case "heatzone": {
        if (intent.cityId) {
          const resp = await fetch(`${BASE}/heatzone/predict/${intent.cityId}`);
          data.heatzone = await resp.json() as any;
          renderTags.push(`[RENDER_CARD:heat_score:${intent.cityId}]`);
          renderTags.push(`[RENDER_CARD:urban_indicators:${intent.cityId}]`);
        } else {
          const resp = await fetch(`${BASE}/heatzone/all`);
          data.allHeatzones = await resp.json() as any;
          renderTags.push("[RENDER_MAP:all]");
        }
        break;
      }
      case "weather": {
        if (intent.cityId) {
          const [wResp, hzResp] = await Promise.all([
            fetch(`${BASE}/weather/current/${intent.cityId}`),
            fetch(`${BASE}/heatzone/predict/${intent.cityId}`)
          ]);
          data.weather = await wResp.json() as any;
          data.heatzone = await hzResp.json() as any;
          renderTags.push(`[RENDER_CARD:heat_score:${intent.cityId}]`);
        }
        break;
      }
      case "overview": {
        const resp = await fetch(`${BASE}/datasets/overview`);
        data.overview = await resp.json() as any;
        renderTags.push("[RENDER_MAP:all]");
        renderTags.push("[RENDER_CHART:city_comparison:all]");
        break;
      }
      default: {
        // For general queries, provide city list + overview
        const [citiesResp, ovResp] = await Promise.all([
          fetch(`${BASE}/cities`),
          fetch(`${BASE}/datasets/overview`)
        ]);
        data.cities = await citiesResp.json() as any;
        data.overview = await ovResp.json() as any;
        break;
      }
    }
  } catch (err) {
    console.error("[Data Fetch Error]", err);
  }

  return { data, renderTags };
}

// ─── System prompt ──────────────────────────────────────────────────────────
function buildSystemPrompt(fetchedData: any, renderTags: string[], intent: DetectedIntent): string {
  const tagsBlock = renderTags.length > 0
    ? `\n\n## MANDATORY RENDER TAGS — YOU MUST INCLUDE THESE EXACTLY AS SHOWN (each on its own line):\n${renderTags.join("\n")}\n`
    : "";

  return `You are **Aria**, the AI Climate Advisor for the HeatZone Urban Climate Intelligence Platform — covering Uttar Pradesh, India.
You are a warm, polite, and professional female climate analyst. Speak with kindness and expertise.

## YOUR REAL DATA (from the database — USE ONLY THIS, NEVER INVENT DATA):
${JSON.stringify(fetchedData, null, 2)}

## RULES — READ CAREFULLY:
1. You MUST use ONLY the real data provided above. NEVER fabricate city names, temperatures, heat scores, or any numbers.
2. The cities in this platform are real Uttar Pradesh cities from the database. The data above contains their ACTUAL names and values.
3. If data is missing or an error occurred, say: "I don't have enough data for this right now. Please try refreshing the data or selecting a specific city."
${tagsBlock}
4. If MANDATORY RENDER TAGS are listed above, you MUST include them in your response, each on its OWN LINE (not inside a sentence).
5. Place the render tags AFTER a brief textual introduction/analysis. Example format:

Here is the heat analysis for [City Name] showing a heat score of X/100...

[RENDER_CARD:heat_score:3]

The key drivers are...

6. Be warm, polite, encouraging. Use markdown formatting (bold, headers, bullet lists).
7. NEVER mention Ollama, qwen, backend systems, APIs, or databases.
8. You are Aria. You have access to real-time data. Never say you cannot provide real-time data.
9. When analyzing data, reference ACTUAL values from the data provided above.
10. Keep responses concise but informative. Focus on insights, not raw data dumps.

## YOUR CAPABILITIES:
- Real-time weather analysis for UP cities
- Heat zone scoring and risk analysis
- 5-day weather forecasts
- Temperature trends and history
- City-to-city comparisons
- AI-powered heat reduction recommendations
- Interactive maps and charts (via RENDER tags)
- Full analytics reports

## IDENTITY:
If asked who you are: "I'm Aria, your AI Climate Advisor on the HeatZone platform. I can analyze heat data, show you maps and charts, generate reports, and provide smart city recommendations for Uttar Pradesh cities."`;
}

// ─── Main chat endpoint ─────────────────────────────────────────────────────
router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages, context } = req.body;

    // Get the latest user message
    const lastUserMessage = messages?.filter((m: any) => m.role === "user").pop()?.content || "";

    // Detect intent from user message
    const contextCityId = context?.id ? parseInt(context.id, 10) : undefined;
    const intent = await detectIntent(lastUserMessage, contextCityId);

    console.log(`[Chat] Intent: ${intent.type}, City: ${intent.cityName || "none"} (ID: ${intent.cityId || "none"})`);

    // Pre-fetch all relevant data
    const { data: fetchedData, renderTags } = await fetchContextData(intent);

    console.log(`[Chat] Fetched data keys: ${Object.keys(fetchedData).join(", ")}`);
    console.log(`[Chat] Render tags: ${renderTags.join(", ") || "none"}`);

    // Build system prompt with real data injected
    const systemPrompt = buildSystemPrompt(fetchedData, renderTags, intent);

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || [])
    ];

    // Call Ollama (no tools — data is already in the prompt)
    const ollamaResponse = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:4b",
        messages: formattedMessages,
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.statusText}`);
    }

    const responseData: any = await ollamaResponse.json();
    let content: string = responseData.message?.content || "";

    // ─── Post-processing: ensure RENDER tags are present ─────
    // If the model forgot to include the mandatory render tags, append them
    for (const tag of renderTags) {
      if (!content.includes(tag)) {
        content += `\n\n${tag}`;
      }
    }

    // Strip any <think>...</think> blocks that qwen3 sometimes emits
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    responseData.message.content = content;
    res.json(responseData);
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: "Failed to communicate with AI Advisor" });
  }
});

export default router;
