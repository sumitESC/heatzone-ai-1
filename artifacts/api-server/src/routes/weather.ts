import { Router, type IRouter } from "express";
import { db, citiesTable, weatherDataTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { fetchCityWeather } from "../lib/weatherService.js";
import { computeHeatRisk, generateRecommendations } from "../lib/heatEngine.js";
import { appendSnapshot, readHistory, saveCurrentWeather, type WeatherSnapshot } from "../lib/weatherHistory.js";
import { generateAdvisories, getOverallSeverity } from "../lib/advisoryEngine.js";
import { heatPredictionsTable, recommendationsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/weather/current/:id", async (req, res): Promise<void> => {
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

  const [latest] = await db
    .select()
    .from(weatherDataTable)
    .where(eq(weatherDataTable.cityId, cityId))
    .orderBy(desc(weatherDataTable.recordedAt))
    .limit(1);

  if (!latest) {
    res.status(404).json({ error: "No weather data available" });
    return;
  }

  res.json({ ...latest, cityName: city.name });
});

router.get("/weather/history/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const cityId = parseInt(raw, 10);
  if (isNaN(cityId)) {
    res.status(400).json({ error: "Invalid city id" });
    return;
  }

  const limitRaw = req.query.limit;
  const limit = limitRaw ? parseInt(String(limitRaw), 10) : 20;

  const [city] = await db.select().from(citiesTable).where(eq(citiesTable.id, cityId));
  if (!city) {
    res.status(404).json({ error: "City not found" });
    return;
  }

  const history = await db
    .select()
    .from(weatherDataTable)
    .where(eq(weatherDataTable.cityId, cityId))
    .orderBy(desc(weatherDataTable.recordedAt))
    .limit(limit);

  res.json(history.map((w) => ({ ...w, cityName: city.name })));
});

// ─── GET the full accumulated JSON weather history ──────────────────────
router.get("/weather/dataset", async (_req, res): Promise<void> => {
  const history = readHistory();
  res.json(history);
});

// ─── GET weather history for a specific city ────────────────────────────
router.get("/weather/dataset/:cityName", async (req, res): Promise<void> => {
  const history = readHistory();
  const name = decodeURIComponent(Array.isArray(req.params.cityName) ? req.params.cityName[0] : req.params.cityName).toLowerCase();
  
  const filtered = {
    ...history,
    snapshots: history.snapshots.map(snap => ({
      ...snap,
      cities: snap.cities.filter(c => c.cityName.toLowerCase() === name)
    })).filter(snap => snap.cities.length > 0)
  };
  filtered.totalSnapshots = filtered.snapshots.length;
  res.json(filtered);
});

router.post("/weather/refresh", async (_req, res): Promise<void> => {
  const cities = await db.select().from(citiesTable);
  let citiesUpdated = 0;

  // Collect snapshot data for the JSON history
  const snapshotCities: WeatherSnapshot["cities"] = [];

  for (const city of cities) {
    const weatherData = await fetchCityWeather(city.name);
    if (!weatherData) continue;

    const [inserted] = await db
      .insert(weatherDataTable)
      .values({ cityId: city.id, ...weatherData })
      .returning();

    if (!inserted) continue;
    citiesUpdated++;

    const heatResult = computeHeatRisk(city, inserted.temperature, inserted.humidity, inserted.windSpeed);

    await db.insert(heatPredictionsTable).values({
      cityId: city.id,
      heatRiskScore: heatResult.heatRiskScore,
      heatZone: heatResult.heatZone,
      temperature: inserted.temperature,
      humidity: inserted.humidity,
      vehicleDensity: heatResult.factors.vehicleDensity,
      populationDensity: heatResult.factors.populationDensity,
      greenCoverRatio: heatResult.factors.greenCoverRatio,
      builtUpRatio: heatResult.factors.builtUpRatio,
      coolingIndex: heatResult.factors.coolingIndex,
      trafficHeatFactor: heatResult.factors.trafficHeatFactor,
      ndvi: city.ndvi,
      ndwi: city.ndwi,
      ndbi: city.ndbi,
      emissionIndex: city.emissionIndex,
    });

    await db.delete(recommendationsTable).where(eq(recommendationsTable.cityId, city.id));
    const recs = generateRecommendations(city.id, city, heatResult.factors, heatResult.heatRiskScore);
    if (recs.length > 0) {
      await db.insert(recommendationsTable).values(recs);
    }

    // Collect this city's data for the JSON snapshot
    const cityTime = new Date();
    snapshotCities.push({
      cityName: city.name,
      cityId: city.id,
      latitude: city.latitude,
      longitude: city.longitude,
      date: cityTime.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }),
      time: cityTime.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
      temperature: inserted.temperature,
      feelsLike: inserted.feelsLike,
      humidity: inserted.humidity,
      windSpeed: inserted.windSpeed,
      pressure: inserted.pressure,
      cloudCover: inserted.cloudCover,
      rainfall: inserted.rainfall,
      weatherMain: inserted.weatherMain,
      weatherDescription: inserted.weatherDescription,
      heatRiskScore: heatResult.heatRiskScore,
      heatZone: heatResult.heatZone,
      ndvi: city.ndvi,
      ndbi: city.ndbi,
      emissionIndex: city.emissionIndex,
    });
  }

  // Append the snapshot to the persistent JSON dataset
  if (snapshotCities.length > 0) {
    const now = new Date();
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const snapshot: WeatherSnapshot = {
      timestamp: now.toISOString(),
      unixTime: Math.floor(now.getTime() / 1000),
      date: now.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }),
      time: now.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
      day: days[now.getDay()],
      cities: snapshotCities,
    };
    appendSnapshot(snapshot);
    saveCurrentWeather(snapshot);
  }

  res.json({ success: true, citiesUpdated, message: `Weather and heat predictions updated for ${citiesUpdated} cities` });
});

// ─── Standalone advisory endpoint ───────────────────────────────────────────
router.get("/weather/advisory/:id", async (req, res): Promise<void> => {
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
