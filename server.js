import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB setup
const uri   = process.env.MONGODB_URI;
const port  = process.env.PORT || 3000;
let coll;

async function connectDB() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('iot_data');
  coll = db.collection('sensor_readings');
  console.log('✅ Connected to MongoDB');
}
connectDB().catch(err => {
  console.error('❌ DB connection error:', err);
  process.exit(1);
});

// Create (ingest sensor data)
app.post('/data', async (req, res) => {
  try {
    const doc = {
      node:        req.body.node || 'edge1',
      door_open:   req.body.door_open,
      temperature: req.body.temperature,
      timestamp:   new Date()
    };
    const result = await coll.insertOne(doc);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (e) {
    res.status(500).json({ error: 'Insert failed' });
  }
});

// Read (list readings)
app.get('/readings', async (req, res) => {
  try {
    const data = await coll.find().sort({ timestamp: -1 }).toArray();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

// Update
app.put('/readings/:id', async (req, res) => {
  try {
    const result = await coll.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: {
          door_open:   req.body.door_open,
          temperature: req.body.temperature
        }}
    );
    if (!result.matchedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ modifiedCount: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Delete
app.delete('/readings/:id', async (req, res) => {
  try {
    const result = await coll.deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: 'Not found' });
    res.json({ deletedCount: result.deletedCount });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Two‑way command
let latestCommand = { action: 'none', value: null, timestamp: new Date() };

app.post('/command', (req, res) => {
  latestCommand = {
    action:    req.body.action,
    value:     req.body.value || null,
    timestamp: new Date()
  };
  res.json({ status: 'ok' });
});
app.get('/command', (req, res) => {
  res.json(latestCommand);
});

// Start server
app.listen(port, () => {
  console.log(`🌐 Server running at http://localhost:${port}`);
});
