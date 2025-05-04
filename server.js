// server.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

// — Middlewares —
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// — Static frontend —
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// — MongoDB setup —
if (!process.env.MONGODB_URI) {
  console.error("❌ MONGODB_URI not set in .env");
  process.exit(1);
}
const client = new MongoClient(process.env.MONGODB_URI, {
  useUnifiedTopology: true,
});
let readingsColl;
client
  .connect()
  .then(() => {
    readingsColl = client.db("iot_data").collection("sensor_readings");
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ DB connection error:", err);
    process.exit(1);
  });

// — In-memory remote flag —
let remoteActive = false;

// — POST /data — ingest sensor packet
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

// — GET /status — report remoteActive + latest reading
app.get("/status", async (req, res) => {
  try {
    const latest = await readingsColl
      .find()
      .sort({ timestamp: -1 })
      .limit(1)
      .next();
    res.json({ remoteActive, latest });
  } catch (err) {
    console.error("❌ GET /status error:", err);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// — POST /remote/activate — toggle remote display
app.post("/remote/activate", (req, res) => {
  remoteActive = !!req.body.active;
  console.log(`📡 remoteActive = ${remoteActive}`);
  res.json({ remoteActive });
});

// — GET /remote/activate — report remote display state
app.get("/remote/activate", (req, res) => {
  res.json({ remoteActive });
});

// — Start server —
const port = parseInt(process.env.PORT, 10) || 4000;
app.listen(port, () => {
  console.log(`🚀 Server listening on port ${port}`);
});
