import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Project root is 4 levels up from api-server/src/lib/
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const HISTORY_FILE = path.join(DATA_DIR, "weather_history.json");

export interface WeatherSnapshot {
  timestamp: string;
  unixTime: number;
  date: string;
  time: string;
  day: string;
  cities: Array<{
    cityName: string;
    cityId: number;
    latitude: number;
    longitude: number;
    date: string;
    time: string;
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    pressure: number;
    cloudCover: number;
    rainfall: number;
    weatherMain: string;
    weatherDescription: string;
    heatRiskScore: number;
    heatZone: string;
    ndvi: number;
    ndbi: number;
    emissionIndex: number;
  }>;
}

export interface WeatherHistoryData {
  lastUpdated: string;
  totalSnapshots: number;
  snapshots: WeatherSnapshot[];
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readHistory(): WeatherHistoryData {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_FILE)) {
    return { lastUpdated: "", totalSnapshots: 0, snapshots: [] };
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    return JSON.parse(raw) as WeatherHistoryData;
  } catch {
    return { lastUpdated: "", totalSnapshots: 0, snapshots: [] };
  }
}

export function appendSnapshot(snapshot: WeatherSnapshot): WeatherHistoryData {
  ensureDataDir();
  const history = readHistory();
  history.snapshots.push(snapshot);
  history.totalSnapshots = history.snapshots.length;
  history.lastUpdated = snapshot.timestamp;
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf-8");
  console.log(`[WeatherHistory] Saved snapshot #${history.totalSnapshots} at ${snapshot.timestamp} (${snapshot.cities.length} cities)`);
  return history;
}

// ─── Current Weather (single file, overwritten each sync) ───────────────
const CURRENT_FILE = path.join(DATA_DIR, "current_weather.json");

export function saveCurrentWeather(snapshot: WeatherSnapshot): void {
  ensureDataDir();
  const current = {
    lastUpdated: snapshot.timestamp,
    date: snapshot.date,
    time: snapshot.time,
    day: snapshot.day,
    totalCities: snapshot.cities.length,
    cities: snapshot.cities,
  };
  fs.writeFileSync(CURRENT_FILE, JSON.stringify(current, null, 2), "utf-8");
  console.log(`[CurrentWeather] Saved current weather for ${snapshot.cities.length} cities at ${snapshot.time}`);
}
