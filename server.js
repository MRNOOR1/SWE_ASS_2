import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const PORT = parseInt(process.env.PORT, 10) || 4000;

async function main() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  app.use(express.json());

  // Health-check endpoint
  app.get("/ping", (_req, res) => res.json({ pong: true }));

  // In-memory remote flag
  let remoteActive = false;

  // Remote activation endpoints
  app.get("/remote/active", (_req, res) => {
    res.json({ active: remoteActive });
  });

  app.post("/remote/active", (req, res) => {
    remoteActive = !!req.body.active;
    console.log(`📡 Remote mode is now ${remoteActive ? "ON" : "OFF"}`);
    res.json({ active: remoteActive });
  });

  // Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI not set in .env");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  console.log("✅ Connected to MongoDB");
  const readingsColl = client.db("iot_data").collection("sensor_readings");

  // Data insertion endpoint
  app.post("/data", async (req, res) => {
    try {
      const { node = "nano1", door_open, temperature } = req.body;
      const doc = { node, door_open, timestamp: new Date() };
      if (typeof temperature === "number") doc.temperature = temperature;
      const result = await readingsColl.insertOne(doc);
      res.status(201).json({ insertedId: result.insertedId });
    } catch (err) {
      console.error("❌ POST /data error:", err);
      res.status(500).json({ error: "Failed to insert reading" });
    }
  });

  // Read-back endpoint
  app.get("/readings", async (_req, res) => {
    try {
      const docs = await readingsColl.find().sort({ timestamp: -1 }).toArray();
      res.json(docs);
    } catch (err) {
      console.error("❌ GET /readings error:", err);
      res.status(500).json({ error: "Failed to fetch readings" });
    }
  });

  // Command endpoint for lock/unlock
  app.post("/command", (req, res) => {
    const { action } = req.body;
    if (action === "lock") console.log("🔒 Lock is now ON");
    else if (action === "unlock") console.log("🔓 Lock is now OFF");
    else console.log(`⚙️ Unknown command: ${action}`);
    res.json({ status: "ok" });
  });

  // Serve static frontend
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  app.use(express.static(path.join(__dirname, "public")));

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("❌ Fatal error starting server:", err);
  process.exit(1);
});
