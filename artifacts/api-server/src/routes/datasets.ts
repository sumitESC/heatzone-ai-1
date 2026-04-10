import { Router, type IRouter } from "express";
import { db, citiesTable, weatherDataTable, heatPredictionsTable, recommendationsTable } from "@workspace/db";
import { eq, desc, avg, sum, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/datasets/city/:id", async (req, res): Promise<void> => {
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

  const [latestWeatherRow] = await db
    .select()
    .from(weatherDataTable)
    .where(eq(weatherDataTable.cityId, cityId))
    .orderBy(desc(weatherDataTable.recordedAt))
    .limit(1);

  const [latestPredRow] = await db
    .select()
    .from(heatPredictionsTable)
    .where(eq(heatPredictionsTable.cityId, cityId))
    .orderBy(desc(heatPredictionsTable.predictedAt))
    .limit(1);

  const recs = await db
    .select()
    .from(recommendationsTable)
    .where(eq(recommendationsTable.cityId, cityId));

  const weatherHistory = await db
    .select()
    .from(weatherDataTable)
    .where(eq(weatherDataTable.cityId, cityId))
    .orderBy(desc(weatherDataTable.recordedAt))
    .limit(20);

  const heatHistory = await db
    .select()
    .from(heatPredictionsTable)
    .where(eq(heatPredictionsTable.cityId, cityId))
    .orderBy(desc(heatPredictionsTable.predictedAt))
    .limit(20);

  const latestWeather = latestWeatherRow ? { ...latestWeatherRow, cityName: city.name } : undefined;
  const latestPrediction = latestPredRow
    ? { ...latestPredRow, cityName: city.name, latitude: city.latitude, longitude: city.longitude }
    : undefined;

  res.json({
    city,
    latestWeather,
    latestPrediction,
    recommendations: recs,
    weatherHistory: weatherHistory.map((w) => ({ ...w, cityName: city.name })),
    heatHistory: heatHistory.map((p) => ({
      ...p,
      cityName: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
    })),
  });
});

router.get("/datasets/overview", async (_req, res): Promise<void> => {
  const cities = await db.select().from(citiesTable);
  const predictions = [];

  let totalHeatRisk = 0;
  let totalTemp = 0;
  let totalHumidity = 0;
  let totalVehicles = 0;
  let totalGreenCover = 0;
  let totalNDVI = 0;
  let totalNDBI = 0;
  let totalEmissionIndex = 0;
  let totalWindSpeed = 0;
  let totalCloudCover = 0;
  let totalPressure = 0;
  let extremeCount = 0;
  let highCount = 0;
  let moderateCount = 0;
  let coolCount = 0;
  let weatherCount = 0;
  const weatherConditionCounts: Record<string, number> = {};
  const cityWeatherEntries: Array<{
    cityId: number;
    cityName: string;
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    pressure: number;
    cloudCover: number;
    rainfall: number;
    weatherMain: string;
    weatherDescription: string;
  }> = [];

  for (const city of cities) {
    const [pred] = await db
      .select()
      .from(heatPredictionsTable)
      .where(eq(heatPredictionsTable.cityId, city.id))
      .orderBy(desc(heatPredictionsTable.predictedAt))
      .limit(1);

    if (pred) {
      predictions.push({
        ...pred,
        cityName: city.name,
        latitude: city.latitude,
        longitude: city.longitude,
      });
      totalHeatRisk += pred.heatRiskScore;
      totalVehicles += city.totalVehicles;
      totalGreenCover += city.forestCover + city.urbanGreenSpace;
      totalNDVI += city.ndvi || 0;
      totalNDBI += city.ndbi || 0;
      totalEmissionIndex += city.emissionIndex || 0;

      if (pred.heatZone === "extreme") extremeCount++;
      else if (pred.heatZone === "high") highCount++;
      else if (pred.heatZone === "moderate") moderateCount++;
      else coolCount++;
    }

    const [weather] = await db
      .select()
      .from(weatherDataTable)
      .where(eq(weatherDataTable.cityId, city.id))
      .orderBy(desc(weatherDataTable.recordedAt))
      .limit(1);

    if (weather) {
      totalTemp += weather.temperature;
      totalHumidity += weather.humidity;
      totalWindSpeed += weather.windSpeed;
      totalCloudCover += weather.cloudCover;
      totalPressure += weather.pressure;
      weatherCount++;

      const cond = weather.weatherMain || "Clear";
      weatherConditionCounts[cond] = (weatherConditionCounts[cond] || 0) + 1;

      cityWeatherEntries.push({
        cityId: city.id,
        cityName: city.name,
        temperature: weather.temperature,
        feelsLike: weather.feelsLike,
        humidity: weather.humidity,
        windSpeed: weather.windSpeed,
        pressure: weather.pressure,
        cloudCover: weather.cloudCover,
        rainfall: weather.rainfall,
        weatherMain: weather.weatherMain,
        weatherDescription: weather.weatherDescription,
      });
    }
  }

  const count = predictions.length;
  res.json({
    totalCities: cities.length,
    avgHeatRisk: count ? Math.round((totalHeatRisk / count) * 10) / 10 : 0,
    extremeHeatCities: extremeCount,
    highHeatCities: highCount,
    moderateHeatCities: moderateCount,
    coolCities: coolCount,
    avgTemperature: weatherCount ? Math.round((totalTemp / weatherCount) * 10) / 10 : 0,
    avgHumidity: weatherCount ? Math.round(totalHumidity / weatherCount) : 0,
    avgWindSpeed: weatherCount ? Math.round((totalWindSpeed / weatherCount) * 10) / 10 : 0,
    avgCloudCover: weatherCount ? Math.round(totalCloudCover / weatherCount) : 0,
    avgPressure: weatherCount ? Math.round(totalPressure / weatherCount) : 0,
    totalVehicles,
    avgGreenCover: count ? Math.round((totalGreenCover / (count * 2)) * 10) / 10 : 0,
    avgNDVI: count ? Math.round((totalNDVI / count) * 1000) / 1000 : 0,
    avgNDBI: count ? Math.round((totalNDBI / count) * 1000) / 1000 : 0,
    avgEmissionIndex: count ? Math.round((totalEmissionIndex / count) * 100) / 100 : 0,
    weatherConditions: weatherConditionCounts,
    cityWeather: cityWeatherEntries,
    lastUpdated: new Date().toISOString(),
    cityPredictions: predictions,
  });
});

export default router;
