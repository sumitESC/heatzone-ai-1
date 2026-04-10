import { db, citiesTable, sqlite } from "@workspace/db";

const NDVI_DATA: Record<string, { ndvi: number; ndbi: number; emissionIndex: number }> = {
  "Lucknow":       { ndvi: 0.28, ndbi: 0.22, emissionIndex: 3.25 },
  "Kanpur":        { ndvi: 0.19, ndbi: 0.10, emissionIndex: 2.52 },
  "Varanasi":      { ndvi: 0.31, ndbi: 0.11, emissionIndex: 1.58 },
  "Prayagraj":     { ndvi: 0.33, ndbi: 0.17, emissionIndex: 4.55 },
  "Agra":          { ndvi: 0.22, ndbi: 0.29, emissionIndex: 4.66 },
  "Ghaziabad":     { ndvi: 0.14, ndbi: 0.12, emissionIndex: 2.23 },
  "Noida":         { ndvi: 0.35, ndbi: 0.29, emissionIndex: 4.32 },
  "Meerut":        { ndvi: 0.18, ndbi: 0.16, emissionIndex: 4.11 },
  "Bareilly":      { ndvi: 0.20, ndbi: 0.27, emissionIndex: 3.18 },
  "Aligarh":       { ndvi: 0.17, ndbi: 0.23, emissionIndex: 3.16 },
  "Moradabad":     { ndvi: 0.15, ndbi: 0.27, emissionIndex: 1.27 },
  "Jhansi":        { ndvi: 0.25, ndbi: 0.16, emissionIndex: 1.18 },
  "Gorakhpur":     { ndvi: 0.22, ndbi: 0.22, emissionIndex: 3.85 },
  "Ayodhya":       { ndvi: 0.28, ndbi: 0.11, emissionIndex: 2.19 },
  "Mathura":       { ndvi: 0.19, ndbi: 0.17, emissionIndex: 2.92 },
  "Saharanpur":    { ndvi: 0.21, ndbi: 0.11, emissionIndex: 3.58 },
  "Muzaffarnagar": { ndvi: 0.16, ndbi: 0.17, emissionIndex: 4.27 },
  "Firozabad":     { ndvi: 0.14, ndbi: 0.19, emissionIndex: 3.53 },
  "Rampur":        { ndvi: 0.18, ndbi: 0.23, emissionIndex: 1.34 },
  "Bijnor":        { ndvi: 0.24, ndbi: 0.12, emissionIndex: 2.72 },
  "Etawah":        { ndvi: 0.22, ndbi: 0.28, emissionIndex: 2.99 },
  "Rae Bareli":    { ndvi: 0.20, ndbi: 0.20, emissionIndex: 1.25 },
  "Sitapur":       { ndvi: 0.21, ndbi: 0.16, emissionIndex: 4.02 },
  "Hardoi":        { ndvi: 0.19, ndbi: 0.17, emissionIndex: 3.01 },
};

async function patch() {
  console.log("🔧 Patching NDVI/NDBI/EmissionIndex in cities table...");

  // Use raw SQL via better-sqlite3 to avoid needing drizzle-orm eq import
  const stmt = sqlite.prepare("UPDATE cities SET ndvi = ?, ndbi = ?, emission_index = ? WHERE name = ?");

  for (const [name, data] of Object.entries(NDVI_DATA)) {
    const result = stmt.run(data.ndvi, data.ndbi, data.emissionIndex, name);
    if (result.changes > 0) {
      console.log(`  ✅ ${name}: NDVI=${data.ndvi}, NDBI=${data.ndbi}, Emission=${data.emissionIndex}`);
    } else {
      console.log(`  ⚠️  ${name}: not found in DB`);
    }
  }

  console.log("\n✅ Patch complete!");
  process.exit(0);
}

patch().catch((e) => { console.error(e); process.exit(1); });
