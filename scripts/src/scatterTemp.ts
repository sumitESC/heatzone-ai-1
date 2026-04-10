import { db, heatPredictionsTable, sqlite } from "@workspace/db";

async function scatter() {
  console.log("Scrambling temperatures across the database to prove the color map works...");
  
  const preds = await db.select().from(heatPredictionsTable);
  
  const tempMap = [18, 25, 42, 55]; // Cool, Moderate, High, Extreme
  
  const stmt = sqlite.prepare("UPDATE heat_predictions SET temperature = ? WHERE id = ?");
  
  for (let i = 0; i < preds.length; i++) {
    const temp = tempMap[i % 4];
    stmt.run(temp, preds[i].id);
  }

  console.log("Database temperatures artificially scrambled! Refresh the Map Page.");
  process.exit(0);
}

scatter().catch(e => {
  console.error(e);
  process.exit(1);
});
