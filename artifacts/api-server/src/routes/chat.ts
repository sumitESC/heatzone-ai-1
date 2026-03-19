import { Router, type IRouter, Request, Response } from "express";
import { db, citiesTable, weatherDataTable, heatPredictionsTable, recommendationsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

// ─── Tool definitions for Ollama ────────────────────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_all_cities",
      description: "Returns a list of all cities in the system with their IDs, names, coordinates, and metadata such as population, vehicles, green cover, etc.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_city_info",
      description: "Returns detailed information about a specific city by its numeric ID.",
      parameters: {
        type: "object",
        properties: { city_id: { type: "number", description: "The numeric ID of the city" } },
        required: ["city_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_current_weather",
      description: "Returns the latest weather data (temperature, humidity, wind speed, etc.) for a specific city by its numeric ID.",
      parameters: {
        type: "object",
        properties: { city_id: { type: "number", description: "The numeric ID of the city" } },
        required: ["city_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_weather_history",
      description: "Returns the last N weather records for a specific city. Useful for temperature trends.",
      parameters: {
        type: "object",
        properties: {
          city_id: { type: "number", description: "The numeric ID of the city" },
          limit: { type: "number", description: "Number of records to retrieve (default 20)" }
        },
        required: ["city_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_heatzone_prediction",
      description: "Returns the latest heat zone prediction (heat score, zone, temperature, humidity, vehicle density, green cover, etc.) for a specific city.",
      parameters: {
        type: "object",
        properties: { city_id: { type: "number", description: "The numeric ID of the city" } },
        required: ["city_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_heatzone_predictions",
      description: "Returns the latest heat zone prediction for every city. Great for comparing cities or generating a geospatial overview.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_heatzone_history",
      description: "Returns historical heat zone predictions for a city. Useful for heat risk trend analysis.",
      parameters: {
        type: "object",
        properties: {
          city_id: { type: "number", description: "The numeric ID of the city" },
          limit: { type: "number", description: "Number of records to retrieve (default 20)" }
        },
        required: ["city_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_5day_forecast",
      description: "Returns the 5-day weather forecast for a specific city by its numeric ID.",
      parameters: {
        type: "object",
        properties: { city_id: { type: "number", description: "The numeric ID of the city" } },
        required: ["city_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_forecasts_comparison",
      description: "Returns the 5-day forecast for every city. Useful for cross-city temperature ranking and comparison.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_city_full_dataset",
      description: "Returns a full dataset for a city including latest weather, latest heat prediction, recommendations, weather history, and heat history.",
      parameters: {
        type: "object",
        properties: { city_id: { type: "number", description: "The numeric ID of the city" } },
        required: ["city_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_datasets_overview",
      description: "Returns an overview of all cities including average heat risk, average temperature, extreme city counts, average green cover, and heat predictions for every city.",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_recommendations",
      description: "Returns AI-generated heat reduction recommendations for a specific city.",
      parameters: {
        type: "object",
        properties: { city_id: { type: "number", description: "The numeric ID of the city" } },
        required: ["city_id"]
      }
    }
  }
];

// ─── Tool executor ──────────────────────────────────────────────────────────
async function executeTool(name: string, args: any): Promise<any> {
  const BASE = "http://127.0.0.1:5000/api";

  try {
    let url = "";
    switch (name) {
      case "get_all_cities":
        url = `${BASE}/cities`;
        break;
      case "get_city_info":
        url = `${BASE}/cities/${args.city_id}`;
        break;
      case "get_current_weather":
        url = `${BASE}/weather/current/${args.city_id}`;
        break;
      case "get_weather_history":
        url = `${BASE}/weather/history/${args.city_id}?limit=${args.limit || 20}`;
        break;
      case "get_heatzone_prediction":
        url = `${BASE}/heatzone/predict/${args.city_id}`;
        break;
      case "get_all_heatzone_predictions":
        url = `${BASE}/heatzone/all`;
        break;
      case "get_heatzone_history":
        url = `${BASE}/heatzone/history/${args.city_id}?limit=${args.limit || 20}`;
        break;
      case "get_5day_forecast":
        url = `${BASE}/forecast/${args.city_id}`;
        break;
      case "get_all_forecasts_comparison":
        url = `${BASE}/forecast/all/compare`;
        break;
      case "get_city_full_dataset":
        url = `${BASE}/datasets/city/${args.city_id}`;
        break;
      case "get_datasets_overview":
        url = `${BASE}/datasets/overview`;
        break;
      case "get_recommendations":
        url = `${BASE}/recommendations/${args.city_id}`;
        break;
      default:
        return { error: `Unknown tool: ${name}` };
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      return { error: `API returned ${resp.status}: ${resp.statusText}` };
    }
    return await resp.json() as any;
  } catch (err: any) {
    return { error: `Tool execution failed: ${err.message}` };
  }
}

// ─── System prompt ──────────────────────────────────────────────────────────
function buildSystemPrompt(activeContext: any): string {
  return `You are **Aria**, the AI Climate Advisor for the HeatZone Urban Climate Intelligence Platform. You are a warm, polite, and professional female climate analyst. Speak in a warm, empathetic, and encouraging style — like a knowledgeable mentor who genuinely cares about cities and their people.

## Your Identity
- Name: Aria (HeatZone AI Advisor)
- Personality: Polite, warm, professional, slightly analytical, encouraging
- You have conversational memory within this session

## Tools Available
You have access to real-time tools that query the HeatZone database. ALWAYS use tools to get the latest data before answering. Never fabricate data. The tools give you live access to:
- City information, weather data, heat zone predictions
- 5-day forecasts, historical trends
- Full datasets and city comparisons
- AI-generated recommendations

## Current Context (from UI)
${JSON.stringify(activeContext, null, 2)}

## When to use which tool
- User asks about a city's current weather → get_current_weather
- User asks about heat score or heat zone → get_heatzone_prediction
- User asks for forecast → get_5day_forecast
- User asks to compare cities → get_all_heatzone_predictions or get_all_forecasts_comparison
- User asks for recommendations → get_recommendations
- User asks for trends or history → get_weather_history or get_heatzone_history
- User asks for a map → get_all_heatzone_predictions (or get_heatzone_prediction for a single city)
- User asks for overview/analytics → get_datasets_overview
- User asks for full city data → get_city_full_dataset
- If you don't know the city ID, first call get_all_cities to look it up by name

## CRITICAL: Rich Widget Rendering
When you have data and the user asks for visual content, you MUST embed special tags in your response so the frontend can render interactive widgets. Place them on their own line.
Use EXACTLY these tag formats (the frontend parses them):

### Maps
- Single city map: \`[RENDER_MAP:cityId]\` — e.g. \`[RENDER_MAP:3]\`
- All cities map: \`[RENDER_MAP:all]\`

### Charts
- Temperature trend for a city: \`[RENDER_CHART:temperature_trend:cityId]\` — e.g. \`[RENDER_CHART:temperature_trend:3]\`
- Heat score trend: \`[RENDER_CHART:heat_trend:cityId]\`
- 5-day forecast chart: \`[RENDER_CHART:forecast:cityId]\`
- Compare all cities temperatures: \`[RENDER_CHART:city_comparison:all]\`
- 5-day temperature ranking: \`[RENDER_CHART:temperature_ranking:all]\`

### Data Cards
- Key urban indicators: \`[RENDER_CARD:urban_indicators:cityId]\`
- Smart city heat score: \`[RENDER_CARD:heat_score:cityId]\`
- AI reduction recommendations: \`[RENDER_CARD:recommendations:cityId]\`
- 5-day forecast table: \`[RENDER_CARD:forecast_table:cityId]\`

### Full AI Report (IMPORTANT — use when asked for "report", "full analysis", "generate report", "complete analytics")
- Full city report with map, graphs, indicators, forecast, and recommendations: \`[RENDER_REPORT:cityId]\` — e.g. \`[RENDER_REPORT:3]\`
- This generates a comprehensive analytics document with: geospatial map, heat score radar, urban indicators, temperature trend, 5-day forecast chart, heat score history, and AI recommendations — all in one view.

IMPORTANT RULES:
1. ALWAYS use tools to fetch data; NEVER make up numbers.
2. Place tags on their OWN LINE, not inside paragraphs.
3. When showing maps/charts, still provide a brief textual analysis alongside them.
4. If user asks to "show" something visual, ALWAYS include the appropriate RENDER tag.
5. Be warm, polite, and encouraging. Address the user kindly.
6. When asked "who are you", explain you are Aria, the built-in AI advisor.
7. NEVER mention Ollama, qwen, or backend systems.
8. Format text responses with markdown — use bold, headers, bullet lists for clarity.
9. When user asks for a "report" or "full analysis", use [RENDER_REPORT:cityId]. Provide a brief introduction before the tag.`;
}

// ─── Main chat endpoint ─────────────────────────────────────────────────────
router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages, context } = req.body;
    let activeContext = context || {};

    // Auto-detect city from user message if no context provided
    if (!activeContext?.id) {
      const lastUserMessage = messages?.filter((m: any) => m.role === "user").pop()?.content || "";
      if (lastUserMessage) {
        const allCities = await db.select().from(citiesTable);
        const matched = allCities.find((c: any) =>
          lastUserMessage.toLowerCase().includes(c.name.toLowerCase())
        );
        if (matched) {
          activeContext = { id: matched.id, name: matched.name, source: "auto-detect" };
        }
      }
    }

    const systemPrompt = buildSystemPrompt(activeContext);

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || [])
    ];

    // ─── Tool calling loop (max 5 iterations) ──────────────────
    let currentMessages = formattedMessages;
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const ollamaResponse = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen3:4b",
          messages: currentMessages,
          tools: TOOLS,
          stream: false
        })
      });

      if (!ollamaResponse.ok) {
        throw new Error(`Ollama API error: ${ollamaResponse.statusText}`);
      }

      const data: any = await ollamaResponse.json();
      const msg = data.message;

      // If no tool calls, we have the final answer
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        res.json(data);
        return;
      }

      // The model wants to call tools — execute them and loop
      currentMessages.push(msg); // Add assistant message with tool_calls

      for (const toolCall of msg.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = toolCall.function.arguments || {};

        console.log(`[Tool Call ${i + 1}] ${toolName}(${JSON.stringify(toolArgs)})`);

        const result = await executeTool(toolName, toolArgs);

        currentMessages.push({
          role: "tool",
          content: JSON.stringify(result)
        });
      }
    }

    // If we exceeded iterations, ask for a final answer
    currentMessages.push({
      role: "user",
      content: "Please summarize the information you've gathered and provide your final answer now."
    });

    const finalResponse = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen3:4b",
        messages: currentMessages,
        stream: false
      })
    });

    if (!finalResponse.ok) {
      throw new Error(`Ollama API error (final): ${finalResponse.statusText}`);
    }

    const finalData: any = await finalResponse.json();
    res.json(finalData);
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: "Failed to communicate with AI Advisor" });
  }
});

export default router;
