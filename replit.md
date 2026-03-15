# HeatZone AI – Uttar Pradesh Urban Heat Intelligence System

## Overview

Full-stack AI-powered urban heat island detection and analysis platform for major cities in Uttar Pradesh. Analyzes environmental, transportation, and urban infrastructure data to detect heat zones and generate intelligent recommendations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite + TailwindCSS v4 + Recharts + React-Leaflet
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Maps**: Leaflet / React-Leaflet
- **Charts**: Recharts
- **Weather data**: OpenWeather API (+ fallback simulation)

## Monitored Cities

1. Lucknow (state capital)
2. Kanpur (industrial)
3. Varanasi (heritage)
4. Prayagraj
5. Agra
6. Ghaziabad (NCR, high density)
7. Noida (NCR, tech hub)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (routes, heat engine, weather service)
│   └── heatzone-ai/        # React + Vite frontend (dashboard, map, analytics)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
│   └── src/seedData.ts     # Seeds all 7 UP cities with realistic data
```

## Database Tables

- `cities` — city metadata (population, land use, vehicles, green cover)
- `weather_data` — historical weather readings per city
- `heat_predictions` — ML-computed heat risk scores and zone classifications
- `recommendations` — AI-generated recommendations per city

## ML Heat Risk Engine

Location: `artifacts/api-server/src/lib/heatEngine.ts`

**Input features:**
- Temperature, humidity, wind speed (from OpenWeather API)
- Vehicle density (vehicles / km²)
- Population density
- Green cover ratio (forest + urban green / total area)
- Built-up ratio (built-up area / total area)
- Cooling index (green ratio × wind speed)

**Output:**
- Heat Risk Score (0–100)
- Heat Zone: cool (<30), moderate (30–60), high (60–80), extreme (80–100)

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/cities | List all 7 UP cities |
| GET | /api/cities/:id | City details |
| GET | /api/weather/current/:id | Latest weather for city |
| GET | /api/weather/history/:id | Weather history |
| POST | /api/weather/refresh | Fetch fresh weather from OpenWeather API |
| GET | /api/heatzone/predict/:id | Latest heat prediction |
| GET | /api/heatzone/all | All city predictions (for map) |
| GET | /api/heatzone/history/:id | Heat prediction history |
| GET | /api/recommendations/:id | AI recommendations for city |
| GET | /api/datasets/city/:id | Full dataset for city detail page |
| GET | /api/datasets/overview | Dashboard overview stats |

## Frontend Pages

- `/` — Dashboard with stats cards + heat risk bar chart
- `/map` — Interactive Leaflet map of UP with heat zone markers
- `/analytics` — Cross-city comparison charts
- `/city/:cityId` — Full city analysis with weather + trends + recommendations

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)
- `OPENWEATHER_API_KEY` — OpenWeather API key for real-time weather
- `PORT` — Server port (auto-assigned)

## Seeding Data

```bash
pnpm --filter @workspace/scripts run seedData
```

## Running Codegen

```bash
pnpm --filter @workspace/api-spec run codegen
```
