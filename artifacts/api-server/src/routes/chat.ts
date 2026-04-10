import { Router, type IRouter, Request, Response } from "express";
import { db, citiesTable, weatherDataTable, heatPredictionsTable, recommendationsTable } from "@workspace/db";
import { eq, desc, avg } from "drizzle-orm";
import { fetchRawV2Weather, fetchRawV2Forecast } from "../lib/weatherV2Service.js";
import { generateAdvisories, getOverallSeverity, type Advisory } from "../lib/advisoryEngine.js";

const router: IRouter = Router();

// ─── Current date/time helper ───────────────────────────────────────────────
function getCurrentDateContext(): {
  isoDate: string;
  localDate: string;
  localTime: string;
  dayOfWeek: string;
  timezone: string;
  unixTimestamp: number;
} {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return {
    isoDate: now.toISOString(),
    localDate: now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "long", day: "numeric" }),
    localTime: now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }),
    dayOfWeek: days[now.getDay()],
    timezone: "Asia/Kolkata (IST, UTC+5:30)",
    unixTimestamp: Math.floor(now.getTime() / 1000)
  };
}

// ─── Intent detection: figure out what the user wants ───────────────────────
interface DetectedIntent {
  type: "map" | "chart" | "report" | "forecast" | "comparison" | "recommendations" | "heatzone" | "weather" | "overview" | "advisory" | "identity" | "general";
  cityId?: number;
  cityName?: string;
  matchedCities?: { id: number; name: string }[];
  chartType?: string;
  temporalHint?: "today" | "tomorrow" | "yesterday" | "this_week" | "next_days";
  domainHint?: "health" | "agriculture" | "travel" | "infrastructure" | "safety";
}

async function detectIntent(userMessage: string, contextCityId?: number): Promise<DetectedIntent> {
  const msg = userMessage.toLowerCase();

  // Look up ALL mentioned cities from the message
  const allCities = await db.select().from(citiesTable);
  const matchedCities = allCities.filter(c => msg.includes(c.name.toLowerCase()));
  let matchedCity = matchedCities[0] || null;

  // Fallback to context city
  const cityId = matchedCity?.id ?? contextCityId ?? undefined;
  let cityName: string | undefined = matchedCity?.name ?? undefined;
  if (!cityName && contextCityId) {
    cityName = allCities.find(c => c.id === contextCityId)?.name ?? undefined;
  }
  const multiCities = matchedCities.length > 0 ? matchedCities.map(c => ({ id: c.id, name: c.name })) : undefined;

  // Detect temporal hints
  let temporalHint: DetectedIntent["temporalHint"] | undefined;
  if (msg.match(/\b(today|tonight|right now|currently)\b/)) temporalHint = "today";
  else if (msg.match(/\b(tomorrow|next day)\b/)) temporalHint = "tomorrow";
  else if (msg.match(/\b(yesterday|last day)\b/)) temporalHint = "yesterday";
  else if (msg.match(/\b(this week|past week|last 7 days)\b/)) temporalHint = "this_week";
  else if (msg.match(/\b(next.*days|upcoming|5.day|five.day|next week)\b/)) temporalHint = "next_days";

  // Detect domain hints
  let domainHint: DetectedIntent["domainHint"] | undefined;
  if (msg.match(/\b(health|medical|heat stroke|dehydrat|hospital|elderly|children)\b/)) domainHint = "health";
  else if (msg.match(/\b(crop|farm|agri|harvest|irrigation|sowing|planting|wheat|rice)\b/)) domainHint = "agriculture";
  else if (msg.match(/\b(travel|road|drive|flight|commut|highway|journey|trip)\b/)) domainHint = "travel";
  else if (msg.match(/\b(infra|grid|power|electric|road.*damage|rail|bridge|water.*log)\b/)) domainHint = "infrastructure";
  else if (msg.match(/\b(safe|danger|risk|emergency|evacuate|flood|disaster)\b/)) domainHint = "safety";

  // ── Identity queries ──────────────────────────────────────────────────
  if (msg.match(/\b(who are you|what are you|about you|your name|what can you do|your abilit|your capabilit|introduce yourself|tell me about yourself|what do you know)\b/)) {
    return { type: "identity", cityId, cityName, temporalHint, domainHint };
  }

  // ── Advisory queries ──────────────────────────────────────────────────
  if (msg.match(/\b(advisory|advise|advis|precaution|safety tip|warning|alert|should i go outside|is it safe)\b/) || domainHint) {
    // If there's a domain hint but no explicit advisory keyword, still check for advisory intent
    if (domainHint && !msg.match(/\b(weather|temperature|forecast|map|chart|trend|compar)\b/)) {
      return { type: "advisory", cityId, cityName, temporalHint, domainHint };
    }
    if (msg.match(/\b(advisory|advise|advis|precaution|safety tip|warning|alert|is it safe)\b/)) {
      return { type: "advisory", cityId, cityName, temporalHint, domainHint };
    }
  }

  // ── Existing intent patterns (enhanced) ───────────────────────────────
  if (msg.match(/\b(report|full analysis|complete analytics|generate report|detailed report|full report)\b/)) {
    return { type: "report", cityId, cityName, temporalHint, domainHint };
  }
  if (msg.match(/\b(map|geospatial|location|satellite)\b/)) {
    return { type: "map", cityId, cityName, temporalHint, domainHint };
  }
  if (msg.match(/\b(compar|ranking|rank|versus|vs)\b/) || matchedCities.length >= 2) {
    return { type: "comparison", cityId, cityName, matchedCities: multiCities, temporalHint, domainHint };
  }
  if (msg.match(/\b(forecast|5.day|five.day|next.*days|upcoming)\b/) || temporalHint === "tomorrow" || temporalHint === "next_days") {
    return { type: "forecast", cityId, cityName, temporalHint, domainHint };
  }
  if (msg.match(/\b(trend|history|historical|past|graph|chart|temperature trend|temp trend)\b/) || temporalHint === "yesterday" || temporalHint === "this_week") {
    return { type: "chart", cityId, cityName, temporalHint, domainHint };
  }
  if (msg.match(/\b(recommend|suggestion|reduc|solution|cool|action|mitigation)\b/)) {
    return { type: "recommendations", cityId, cityName, temporalHint, domainHint };
  }
  if (msg.match(/\b(heat.*score|heat.*zone|heat.*risk|heat.*index|urban heat)\b/)) {
    return { type: "heatzone", cityId, cityName, temporalHint, domainHint };
  }
  if (msg.match(/\b(weather|temperature|humidity|wind|rain|current)\b/) || temporalHint === "today") {
    return { type: "weather", cityId, cityName, temporalHint, domainHint };
  }
  if (msg.match(/\b(overview|summary|all cities|platform|dashboard)\b/)) {
    return { type: "overview", cityId, cityName, temporalHint, domainHint };
  }

  return { type: "general", cityId, cityName, temporalHint, domainHint };
}

// ─── Data fetcher: pre-fetch relevant data ──────────────────────────────────
async function fetchContextData(intent: DetectedIntent): Promise<{ data: any; renderTags: string[] }> {
  const renderTags: string[] = [];
  let data: any = {};

  try {
    const BASE = "http://127.0.0.1:5000/api";

    // Dynamic Targeted Context: Protect Gemma's context token window!
    // ONLY fetch the massive v2.5 data structures if a distinct Target City is in focus.
    if (intent.cityName) {
      try {
        const [rawWeather, rawForecast] = await Promise.all([
          fetchRawV2Weather(intent.cityName),
          fetchRawV2Forecast(intent.cityName)
        ]);
        data.openweather_v2_5_direct_api_for_target_city = {
          currentWeather: rawWeather,
          forecast_5day_3hour_steps: rawForecast
        };

        // ── Parsed Weather Summary: extract ALL key fields from raw v2.5 ──
        // Support fallback to DB data if the live API fails
        let weatherSourceData = rawWeather;
        let isLive = !!rawWeather;

        if (!weatherSourceData && intent.cityId) {
          try {
            const [dbLatest] = await db.select().from(weatherDataTable)
              .where(eq(weatherDataTable.cityId, intent.cityId))
              .orderBy(desc(weatherDataTable.recordedAt)).limit(1);
            if (dbLatest) {
              // Map DB format back to a structure current_weather_summary expects
              weatherSourceData = {
                name: intent.cityName,
                main: { 
                  temp: dbLatest.temperature, 
                  feels_like: dbLatest.feelsLike, 
                  humidity: dbLatest.humidity,
                  pressure: dbLatest.pressure 
                },
                wind: { speed: dbLatest.windSpeed },
                clouds: { all: dbLatest.cloudCover },
                weather: [{ main: dbLatest.weatherMain, description: dbLatest.weatherDescription }],
                dt: Math.floor(new Date(dbLatest.recordedAt).getTime() / 1000)
              };
            }
          } catch (e) { console.error("DB fallback failed"); }
        }

        if (weatherSourceData) {
          const w = weatherSourceData;
          data.current_weather_summary = {
            city: w.name || intent.cityName,
            country: w.sys?.country || "IN",
            data_source: isLive ? "live_api_v2.5" : "cached_database_record",
            coordinates: { lat: w.coord?.lat, lon: w.coord?.lon },
            temperature: {
              current: w.main?.temp,
              feels_like: w.main?.feels_like,
              min: w.main?.temp_min,
              max: w.main?.temp_max,
              unit: "°C"
            },
            humidity: { value: w.main?.humidity, unit: "%" },
            pressure: {
              sea_level: w.main?.pressure,
              ground_level: w.main?.grnd_level,
              unit: "hPa"
            },
            wind: {
              speed: w.wind?.speed,
              speed_unit: "m/s",
              direction_degrees: w.wind?.deg,
              gust: w.wind?.gust,
              gust_unit: "m/s"
            },
            clouds: { coverage: w.clouds?.all, unit: "%" },
            visibility: { value: w.visibility, unit: "meters", km: w.visibility ? (w.visibility / 1000).toFixed(1) + " km" : null },
            weather: {
              condition: w.weather?.[0]?.main,
              description: w.weather?.[0]?.description,
              icon: w.weather?.[0]?.icon
            },
            rainfall: {
              last_1h: w.rain?.["1h"] ?? 0,
              last_3h: w.rain?.["3h"] ?? 0,
              unit: "mm"
            },
            sun: {
              sunrise: w.sys?.sunrise ? new Date(w.sys.sunrise * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }) : null,
              sunset: w.sys?.sunset ? new Date(w.sys.sunset * 1000).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }) : null
            },
            recorded_at: w.dt ? new Date(w.dt * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : null
          };
        }

        // ── Parsed Forecast Summary: clean 5-day overview from raw v2.5 ──
        if (rawForecast?.list) {
          const dayMap = new Map<string, any[]>();
          for (const item of rawForecast.list) {
            const date = item.dt_txt?.split(" ")[0];
            if (!date) continue;
            if (!dayMap.has(date)) dayMap.set(date, []);
            dayMap.get(date)!.push(item);
          }

          const forecastSummary: any[] = [];
          let count = 0;
          for (const [date, entries] of dayMap) {
            if (count >= 5) break;
            const temps = entries.map((e: any) => e.main.temp);
            const humidities = entries.map((e: any) => e.main.humidity);
            const winds = entries.map((e: any) => e.wind.speed);
            const midday = entries.find((e: any) => e.dt_txt?.includes("12:00:00")) || entries[Math.floor(entries.length / 2)];
            const rain = entries.reduce((s: number, e: any) => s + (e.rain?.["3h"] ?? 0), 0);

            forecastSummary.push({
              date,
              day_of_week: new Date(date).toLocaleDateString("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }),
              temperature: {
                min: Math.round(Math.min(...temps) * 10) / 10,
                max: Math.round(Math.max(...temps) * 10) / 10,
                avg: Math.round((temps.reduce((a: number, b: number) => a + b, 0) / temps.length) * 10) / 10,
                unit: "°C"
              },
              humidity: {
                avg: Math.round(humidities.reduce((a: number, b: number) => a + b, 0) / humidities.length),
                unit: "%"
              },
              wind: {
                avg_speed: Math.round((winds.reduce((a: number, b: number) => a + b, 0) / winds.length) * 10) / 10,
                max_speed: Math.round(Math.max(...winds) * 10) / 10,
                unit: "m/s"
              },
              rainfall_total: { value: Math.round(rain * 10) / 10, unit: "mm" },
              weather: {
                condition: midday.weather?.[0]?.main,
                description: midday.weather?.[0]?.description
              },
              data_points: entries.length
            });
            count++;
          }
          data.forecast_5day_summary = forecastSummary;
        }
      } catch (e) { console.error("Failed to fetch Raw v2.5 weather payloads for:", intent.cityName); }

      // ── Historical comparison: 7-day average vs current ──────────────
      if (intent.cityId) {
        try {
          const recentWeather = await db
            .select()
            .from(weatherDataTable)
            .where(eq(weatherDataTable.cityId, intent.cityId))
            .orderBy(desc(weatherDataTable.recordedAt))
            .limit(7);

          if (recentWeather.length > 1) {
            const avgTemp = recentWeather.reduce((s, w) => s + w.temperature, 0) / recentWeather.length;
            const avgHumidity = recentWeather.reduce((s, w) => s + w.humidity, 0) / recentWeather.length;
            const latestTemp = recentWeather[0].temperature;
            const latestHumidity = recentWeather[0].humidity;

            data.historical_comparison = {
              period: `Last ${recentWeather.length} records`,
              avgTemperature: Math.round(avgTemp * 10) / 10,
              avgHumidity: Math.round(avgHumidity * 10) / 10,
              currentTemperature: latestTemp,
              currentHumidity: latestHumidity,
              tempDelta: Math.round((latestTemp - avgTemp) * 10) / 10,
              humidityDelta: Math.round((latestHumidity - avgHumidity) * 10) / 10,
              tempTrend: latestTemp > avgTemp ? "above_average" : latestTemp < avgTemp ? "below_average" : "at_average"
            };
          }
        } catch (e) { console.error("Failed to compute historical comparison"); }
      }
    } else {
      // Global Fallback for city-scale queries
      const [allHeatzones, allForecasts] = await Promise.all([
        fetch(`${BASE}/heatzone/all`),
        fetch(`${BASE}/forecast/all/compare`)
      ]);
      data.overview_compressed_internal_datasets = { current: await allHeatzones.json(), forecasts: await allForecasts.json() };
    }

    // ALWAYS inject satellite-derived NDVI/NDBI/Emission metrics for all cities
    try {
      const allCities = await db.select().from(citiesTable);
      data.satellite_metrics_all_cities = allCities.map(c => ({
        name: c.name,
        ndvi: c.ndvi,
        ndbi: c.ndbi,
        emissionIndex: c.emissionIndex,
        greenCover: c.forestCover + c.urbanGreenSpace,
        builtUpArea: c.builtUpArea,
        industrialArea: c.industrialArea,
        treeDensity: c.treeDensity
      }));
    } catch (e) { console.error("Failed to fetch satellite metrics"); }

    // ── Generate advisories for targeted city ───────────────────────────
    if (intent.cityId && (intent.type === "advisory" || intent.type === "weather" || intent.type === "heatzone" || intent.type === "report" || intent.type === "forecast")) {
      try {
        const [latestWeather] = await db.select().from(weatherDataTable)
          .where(eq(weatherDataTable.cityId, intent.cityId))
          .orderBy(desc(weatherDataTable.recordedAt)).limit(1);
        const [latestHeat] = await db.select().from(heatPredictionsTable)
          .where(eq(heatPredictionsTable.cityId, intent.cityId))
          .orderBy(desc(heatPredictionsTable.predictedAt)).limit(1);

        if (latestWeather && latestHeat) {
          const advisories = generateAdvisories({
            temperature: latestWeather.temperature,
            feelsLike: latestWeather.feelsLike,
            humidity: latestWeather.humidity,
            windSpeed: latestWeather.windSpeed,
            rainfall: latestWeather.rainfall,
            heatRiskScore: latestHeat.heatRiskScore,
            heatZone: latestHeat.heatZone,
            weatherMain: latestWeather.weatherMain,
            uvIndex: latestWeather.uvIndex ?? undefined,
            cityName: intent.cityName || "Unknown"
          });
          data.ai_advisories = advisories;
          data.advisory_overall_severity = getOverallSeverity(advisories);

          if (intent.type === "advisory") {
            renderTags.push(`[RENDER_CARD:advisory:${intent.cityId}]`);
          }
        }
      } catch (e) { console.error("Failed to generate advisories"); }
    }

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
        // Always fetch all heatzones for comparison
        const [hzResp, fcResp] = await Promise.all([
          fetch(`${BASE}/heatzone/all`),
          fetch(`${BASE}/forecast/all/compare`)
        ]);
        const allHzData = await hzResp.json() as any;
        const allFcData = await fcResp.json() as any;

        // Build an explicit, clean comparison table from real data
        const hzArray = Array.isArray(allHzData) ? allHzData : [];
        if (intent.matchedCities && intent.matchedCities.length >= 2) {
          // Filter to only the requested cities
          const targetNames = intent.matchedCities.map(c => c.name.toLowerCase());
          data.city_comparison_table = hzArray
            .filter((h: any) => targetNames.includes(h.cityName?.toLowerCase()))
            .map((h: any) => ({
              city: h.cityName,
              temperature: h.temperature + "°C",
              humidity: h.humidity + "%",
              windSpeed: h.windSpeed + " m/s",
              heatRiskScore: h.heatRiskScore + "/100",
              heatZone: h.heatZone,
              feelsLike: (h.feelsLike ?? h.temperature) + "°C",
              weatherDescription: h.weatherDescription || h.weatherMain || "-"
            }));
        } else {
          // All cities comparison
          data.city_comparison_table = hzArray.map((h: any) => ({
            city: h.cityName,
            temperature: h.temperature + "°C",
            humidity: h.humidity + "%",
            heatRiskScore: h.heatRiskScore + "/100",
            heatZone: h.heatZone
          }));
        }
        data.allHeatzones = allHzData;
        data.allForecasts = allFcData;
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
      case "advisory": {
        if (intent.cityId) {
          const [wResp, hzResp] = await Promise.all([
            fetch(`${BASE}/weather/current/${intent.cityId}`),
            fetch(`${BASE}/heatzone/predict/${intent.cityId}`)
          ]);
          data.weather = await wResp.json() as any;
          data.heatzone = await hzResp.json() as any;
          renderTags.push(`[RENDER_CARD:heat_score:${intent.cityId}]`);
        } else {
          // If no city specified, provide overview advisories
          const resp = await fetch(`${BASE}/heatzone/all`);
          data.allHeatzones = await resp.json() as any;
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
      case "identity": {
        // No additional data needed — handled in system prompt
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
  const dateCtx = getCurrentDateContext();

  const tagsBlock = renderTags.length > 0
    ? `\n\n## MANDATORY RENDER TAGS — YOU MUST INCLUDE THESE EXACTLY AS SHOWN (each on its own line):\n${renderTags.join("\n")}\n`
    : "";

  // Build advisory summary for the prompt
  let advisoryBlock = "";
  if (fetchedData.ai_advisories && Array.isArray(fetchedData.ai_advisories) && fetchedData.ai_advisories.length > 0) {
    advisoryBlock = `\n\n## AI ADVISORIES (triggered by real conditions — incorporate these into your response):
Overall Severity: ${fetchedData.advisory_overall_severity?.toUpperCase() || "INFO"}
${fetchedData.ai_advisories.map((a: Advisory) =>
      `- [${a.severity.toUpperCase()}] ${a.domain.toUpperCase()}: ${a.title} — ${a.message} (Trigger: ${a.trigger})`
    ).join("\n")}`;
  }

  // Historical context block
  let historicalBlock = "";
  if (fetchedData.historical_comparison) {
    const hc = fetchedData.historical_comparison;
    historicalBlock = `\n\n## HISTORICAL COMPARISON (${hc.period}):
- Average Temperature: ${hc.avgTemperature}°C → Current: ${hc.currentTemperature}°C (${hc.tempDelta > 0 ? "+" : ""}${hc.tempDelta}°C ${hc.tempTrend.replace("_", " ")})
- Average Humidity: ${hc.avgHumidity}% → Current: ${hc.currentHumidity}% (${hc.humidityDelta > 0 ? "+" : ""}${hc.humidityDelta}%)`;
  }

  // Comparison-specific block: build a clean, readable table
  let comparisonBlock = "";
  if (fetchedData.city_comparison_table && Array.isArray(fetchedData.city_comparison_table)) {
    comparisonBlock = `\n\n## CITY COMPARISON DATA — USE THIS TABLE IN YOUR RESPONSE:
| City | Temperature | Humidity | Heat Score | Zone |${fetchedData.city_comparison_table[0]?.windSpeed ? " Wind | Feels Like | Weather |" : ""}
|------|-------------|----------|------------|------|${fetchedData.city_comparison_table[0]?.windSpeed ? "------|-----------|---------|" : ""}
${fetchedData.city_comparison_table.map((c: any) =>
  `| ${c.city} | ${c.temperature} | ${c.humidity} | ${c.heatRiskScore} | ${c.heatZone} |${c.windSpeed ? ` ${c.windSpeed} | ${c.feelsLike} | ${c.weatherDescription} |` : ""}`
).join("\n")}

YOU MUST present this data as a comparison table or side-by-side analysis. Use the EXACT numbers from above. Do NOT say you need more data — you already have it.`;
  }

  // ALWAYS strip the massive raw v2.5 API payloads — we have parsed summaries
  // The raw forecast JSON alone can be 20KB+ and blows past deepseek-r1:8b's context
  const { openweather_v2_5_direct_api_for_target_city, ...strippedData } = fetchedData;
  let dataForPrompt = strippedData;
  if (intent.type === "comparison") {
    const { allHeatzones, allForecasts, ...slimData } = strippedData;
    dataForPrompt = slimData;
  }

  return `You are **Aria**, the AI Climate Advisor & Meteorological Orchestrator for the HeatZone Urban Climate Intelligence Platform — covering Uttar Pradesh, India.
You are a warm, polite, and professional female climate analyst. Speak with kindness, expertise, and scientific precision.

## CURRENT DATE & TIME (you know the current date — use it for "today", "tomorrow", "yesterday" references):
- Date: ${dateCtx.localDate}
- Day: ${dateCtx.dayOfWeek}
- Time: ${dateCtx.localTime}
- Timezone: ${dateCtx.timezone}
- ISO: ${dateCtx.isoDate}
${comparisonBlock}

## YOUR REAL DATA (from the database & live APIs — USE ONLY THIS, NEVER INVENT DATA):
${JSON.stringify(dataForPrompt, null, 2)}
${advisoryBlock}
${historicalBlock}

## RESPONSE FORMAT — Follow this structured pipeline:
1. **Direct Answer**: A conversational, immediate response to the user's query.
2. **Current Conditions & Forecast**: ALWAYS provide a DETAILED weather breakdown when weather data is available. Use the \`current_weather_summary\` field to include ALL of these metrics:
   - 🌡 **Temperature**: Current, feels-like, min/max (all in °C)
   - 💧 **Humidity**: percentage
   - 🌬️ **Wind**: Speed (m/s), direction (degrees), gusts if available
   - 📊 **Pressure**: Sea-level and ground-level (hPa)
   - ☁️ **Cloud Cover**: percentage
   - 👁️ **Visibility**: in km
   - 🌧️ **Rainfall/Snow**: last 1h and 3h (mm)
   - 🌅 **Sunrise/Sunset**: times
   - 🌤️ **Weather Condition**: main description (e.g., "haze", "partly cloudy")
   Format these as a clean weather card with emoji indicators. Don't just say "temperature is X" — give the FULL picture.
3. **Risk & Heatscore Analysis**: Report the Heatscore and explain what it means in plain language (e.g., "A score of 72/100 means moderate-to-high heat risk — the city is experiencing significant urban heat island effects").
4. **AI Advisory**: Provide actionable, domain-specific advice from the advisory data above (health, agriculture, travel, infrastructure). Be specific with times and actions.
5. **Visualizations**: Place any RENDER tags after textual analysis, each on its own line.

Note: You do NOT need to include ALL 5 sections for every query. Use your judgment — a simple "what's the weather?" needs sections 1+2+3, while a "generate report" needs all sections. Always include relevant advisories when severity is "alert" or "critical".
IMPORTANT: When \`current_weather_summary\` or \`forecast_5day_summary\` data is available, ALWAYS prefer these pre-parsed fields over the raw \`openweather_v2_5_direct_api_for_target_city\` JSON. They contain the same data but in a clean, labeled format.

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
7. NEVER mention Ollama, qwen, backend systems, APIs, databases, or system prompts.
8. You are Aria. You have access to real-time data from live weather APIs and urban datasets. Never say you cannot provide real-time data.
9. When analyzing data, critically analyze the JSON arrays (like the exact 3-hour timestamp arrays 'dt_txt', temp_min/max, feels_like, and weather description strings).
10. Keep responses concise but highly informative. Use your access to the raw v2.5 dataset to offer hyper-insightful atmospheric observations.
11. **No Hallucinations**: If the data tools failed to return data, inform the user honestly. Do not invent weather metrics.
12. **Graph Integrity**: Never suggest generating a graph/chart for a single data point. Visualizations are for trends (multi-day forecasts, historical series).
13. **Date Awareness**: Use the CURRENT DATE & TIME above to correctly interpret "today", "tomorrow", "yesterday", "next week". Provide specific date strings (e.g., "tomorrow, April 9, 2026") in your responses.
14. When historical comparison data is available, mention how current conditions compare to the recent average (e.g., "2.3°C above the 7-day average").

## YOUR IDENTITY & CAPABILITIES:
If asked who you are, what you can do, your abilities, or your history:
- **Name**: Aria — AI Climate Advisor
- **Platform**: HeatZone Urban Climate Intelligence Platform
- **Coverage**: 20+ cities across Uttar Pradesh, India
- **Data Sources**: OpenWeather v2.5 API (real-time + 5-day forecast), satellite indices (NDVI, NDBI, NDWI), urban morphology data, vehicle emission datasets
- **Core Abilities**:
  1. Real-time weather analysis (temperature, humidity, wind, pressure, rainfall, cloud cover)
  2. Composite Heatscore calculation (0–100 scale with cool/moderate/high/extreme zones)
  3. 5-day weather forecasting with 3-hour resolution
  4. Historical temperature/heat trends and comparisons
  5. City-to-city ranking and comparison analytics
  6. AI-powered heat reduction recommendations
  7. Domain-specific advisories: Health, Agriculture, Travel, Infrastructure, Public Safety
  8. Interactive map visualizations with heat overlays
  9. Dynamic charts (line, bar, radar) rendered inline
  10. Full city analytics reports with all metrics combined
  11. Voice interaction (speech-to-text input, text-to-speech responses)
- **Heatscore Algorithm**: Composite metric weighing temperature (30%), vehicle density (20%), humidity (15%), built-up ratio (15%), population density (10%), and green cover penalty (10%), with a cooling index bonus
- **History**: Built as part of the HeatZone Urban Intelligence initiative to combat urban heat islands in rapidly developing Indian cities`;
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

    console.log(`[Chat] Intent: ${intent.type}, City: ${intent.cityName || "none"} (ID: ${intent.cityId || "none"}), Temporal: ${intent.temporalHint || "none"}, Domain: ${intent.domainHint || "none"}`);

    // Pre-fetch all relevant data
    const { data: fetchedData, renderTags } = await fetchContextData(intent);

    console.log(`[Chat] Data keys to LLM: ${Object.keys(fetchedData).join(", ")}`);
    if (fetchedData.current_weather_summary) {
      console.log(`[Chat] Weather Summary: ${fetchedData.current_weather_summary.city}, Source: ${fetchedData.current_weather_summary.data_source}, Temp: ${fetchedData.current_weather_summary.temperature.current}°C`);
    }

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
        model: "deepseek-r1:8b",
        messages: formattedMessages,
        stream: false,
        options: {
          num_ctx: 8192
        }
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

    // Strip any <think>...</think> blocks that some models emit
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    responseData.message.content = content;
    res.json(responseData);
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: "Failed to communicate with AI Advisor" });
  }
});

// ─── Standalone advisory endpoint ───────────────────────────────────────────
router.get("/chat/advisory/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const cityId = parseInt(raw, 10);
    if (isNaN(cityId)) {
      res.status(400).json({ error: "Invalid city id" });
      return;
    }

    const [city] = await db.select().from(citiesTable).where(eq(citiesTable.id, cityId));
    if (!city) {
      res.status(404).json({ error: "City not found" });
      return;
    }

    const [latestWeather] = await db.select().from(weatherDataTable)
      .where(eq(weatherDataTable.cityId, cityId))
      .orderBy(desc(weatherDataTable.recordedAt)).limit(1);
    const [latestHeat] = await db.select().from(heatPredictionsTable)
      .where(eq(heatPredictionsTable.cityId, cityId))
      .orderBy(desc(heatPredictionsTable.predictedAt)).limit(1);

    if (!latestWeather || !latestHeat) {
      res.status(404).json({ error: "No weather/heat data available" });
      return;
    }

    const advisories = generateAdvisories({
      temperature: latestWeather.temperature,
      feelsLike: latestWeather.feelsLike,
      humidity: latestWeather.humidity,
      windSpeed: latestWeather.windSpeed,
      rainfall: latestWeather.rainfall,
      heatRiskScore: latestHeat.heatRiskScore,
      heatZone: latestHeat.heatZone,
      weatherMain: latestWeather.weatherMain,
      uvIndex: latestWeather.uvIndex ?? undefined,
      cityName: city.name
    });

    res.json({
      cityId: city.id,
      cityName: city.name,
      overallSeverity: getOverallSeverity(advisories),
      advisories,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Advisory API error:", error);
    res.status(500).json({ error: "Failed to generate advisories" });
  }
});

export default router;
