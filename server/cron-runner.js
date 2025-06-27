// cron-runner.js
import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import { runAutoSyncs } from "./orchestrator/autoSync.js";

// ⏰ Run every hour
cron.schedule("0 * * * *", async () => {
  console.log("⏰ Running auto syncs...");
  try {
    await runAutoSyncs();
    console.log("✅ Auto syncs complete.");
  } catch (err) {
    console.error("❌ Auto syncs failed:", err.message);
  }
});

// Keep the process alive
console.log("🟢 Cron runner started. Waiting for next job...");
