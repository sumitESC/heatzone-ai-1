import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root BEFORE importing app (which imports weatherService)
dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", ".env") });

// Dynamic import so .env is loaded BEFORE any service modules read process.env
const { default: app } = await import("./app.js");

const rawPort = process.env["PORT"] || "5000";
const port = Number(rawPort);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
