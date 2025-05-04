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

  // Main remote endpoints
  app.get("/remote/active", (_req, res) => {
    console.log(`📡 GET /remote/active -> active=${remoteActive}`);
    res.json({ active: remoteActive });
  });

  app.post("/remote/active", (req, res) => {
    console.log("📡 POST /remote/active", req.body);
    remoteActive = !!req.body.active;
    console.log(`📡 Remote mode is now ${remoteActive ? "ON" : "OFF"}`);
    res.json({ active: remoteActive });
  });

  // Alias for Arduino (/remote/activate)
  app.get("/remote/activate", (_req, res) => {
    console.log(`🔄 ALIAS GET /remote/activate -> active=${remoteActive}`);
    res.json({ remoteActive });
  });
  app.post("/remote/activate", (req, res) => {
    console.log("🔄 ALIAS POST /remote/activate", req.body);
    remoteActive = !!req.body.active;
    console.log(`📡 Remote mode is now ${remoteActive ? "ON" : "OFF"}`);
    res.json({ remoteActive });
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
  const db = client.db("iot_data");
  const readingsColl = db.collection("sensor_readings");

  // Data insertion endpoint
  app.post("/data", async (req, res) => {
    console.log("📥 POST /data payload:", req.body);
    try {
      const { node = "nano1", door_open, temperature } = req.body;
      const timestamp = new Date();
      console.log(`📊 Inserting reading -> node: ${node}, door_open: ${door_open}, temperature: ${temperature}, timestamp: ${timestamp.toLocaleString()}`);
      const doc = { node, door_open, timestamp };
      if (typeof temperature === "number") doc.temperature = temperature;
      const result = await readingsColl.insertOne(doc);
      console.log(`✅ Inserted reading with ID ${result.insertedId}`);
      res.status(201).json({ insertedId: result.insertedId });
    } catch (err) {
      console.error("❌ POST /data error:", err);
      res.status(500).json({ error: "Failed to insert reading" });
    }
  });

  // Latest reading endpoint for Arduino
  app.get("/data/latest", async (_req, res) => {
    console.log("📥 GET /data/latest");
    try {
      const doc = await readingsColl.find().sort({ timestamp: -1 }).limit(1).next();
      if (!doc) {
        console.log("⚠️ No readings available for /data/latest");
        return res.status(404).json({ error: "No readings" });
      }
      console.log(`👁️ Latest reading -> node: ${doc.node}, door_open: ${doc.door_open}, temperature: ${doc.temperature}, timestamp: ${doc.timestamp.toLocaleString()}`);
      res.json({
        door_open: doc.door_open,
        temperature: doc.temperature,
        timestamp: doc.timestamp.toISOString(),
      });
    } catch (err) {
      console.error("❌ GET /data/latest error:", err);
      res.status(500).json({ error: "Failed to fetch latest reading" });
    }
  });

  // Read-back endpoint
  app.get("/readings", async (_req, res) => {
    console.log("📥 GET /readings");
    try {
      const docs = await readingsColl.find().sort({ timestamp: -1 }).toArray();
      console.log(`📤 Returning ${docs.length} readings`);
      res.json(docs);
    } catch (err) {
      console.error("❌ GET /readings error:", err);
      res.status(500).json({ error: "Failed to fetch readings" });
    }
  });

  // Command endpoint for lock/unlock
  app.post("/command", (req, res) => {
    console.log("📥 POST /command", req.body);
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
