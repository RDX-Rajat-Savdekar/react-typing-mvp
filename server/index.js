// server/index.js
import express from "express";
import cors from "cors";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = path.join(__dirname, "db.json");

// lowdb adapter + default data (required by lowdb v7)
const adapter = new JSONFile(dbFile);
const defaultData = { problems: [], attempts: [] };
const db = new Low(adapter, defaultData);

async function initDB() {
  await db.read();
  // db.data is now guaranteed (either existing file content or defaultData)
  db.data ||= defaultData;

  if (!db.data.problems || db.data.problems.length === 0) {
    db.data.problems = [
      { id: "p1", title: "Reverse String", text: "Write a function to reverse a string.", difficulty: "easy" },
      { id: "p2", title: "Two Sum", text: "Given array nums and target, return indices of the two numbers such that they add up to target.", difficulty: "easy" },
      { id: "p3", title: "FizzBuzz", text: "Write a program that prints the numbers from 1 to n. For multiples of three print 'Fizz' instead of the number and for the multiples of five print 'Buzz'.", difficulty: "easy" }
      // add more seed problems if you want
    ];
    await db.write();
  }
}

await initDB();

const app = express();
app.use(cors());
app.use(express.json());

// Endpoints
app.get("/api/problems", async (req, res) => {
  await db.read();
  res.json(db.data.problems);
});

app.get("/api/problems/:id", async (req, res) => {
  const id = req.params.id;
  await db.read();
  const p = db.data.problems.find(x => x.id === id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json(p);
});

app.post("/api/attempts", async (req, res) => {
  const body = req.body;
  if (!body || !body.problemId) return res.status(400).json({ error: "invalid" });

  // simple anti-cheat: rejects impossibly high WPM
  if (body.wpm > 300) return res.status(400).json({ error: "cheat_detected" });

  await db.read();
  const attempt = {
    id: nanoid(),
    user: body.user || "anon",
    problemId: body.problemId,
    wpm: body.wpm,
    accuracy: body.accuracy,
    rawText: body.rawText || "",
    durationMs: body.durationMs,
    createdAt: Date.now()
  };
  db.data.attempts.push(attempt);
  await db.write();
  res.json({ success: true, attempt });
});

app.get("/api/leaderboard", async (req, res) => {
  const { problemId } = req.query;
  await db.read();
  let attempts = db.data.attempts.filter(a => (problemId ? a.problemId === problemId : true));
  attempts.sort((a, b) => b.wpm - a.wpm || b.accuracy - a.accuracy);
  res.json(attempts.slice(0, 50));
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log("Server running on port", PORT));
