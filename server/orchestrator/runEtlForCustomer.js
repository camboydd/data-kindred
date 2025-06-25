import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import crypto from "crypto";
import { insertManualSyncLog } from "../util/manualSyncLogger.js";
import { connectToSnowflake } from "../util/snowflake-connection.js";
import axios from "axios";

export async function runEtlForCustomerOld(
  connectorId,
  accountId,
  options = {}
) {
  const { refreshWindow = "30d", manualSyncId = crypto.randomUUID() } = options;

  const scripts = ["metadata.py", "snowpipe.py"];
  const scriptPath = (name) => {
    // Check if the script exists at ./etl/... (local dev)
    const localPath = path.join(process.cwd(), "etl", connectorId, name);
    const serverPath = path.join(
      process.cwd(),
      "server",
      "etl",
      connectorId,
      name
    );

    if (fs.existsSync(localPath)) {
      return localPath;
    } else if (fs.existsSync(serverPath)) {
      return serverPath;
    } else {
      throw new Error(
        `Script not found in either path: ${localPath} or ${serverPath}`
      );
    }
  };

  const runScript = (scriptName) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const fullPath = scriptPath(scriptName);
      let rowCount = 0;

      const env = {
        ...process.env,
        MANUAL_SYNC_ID: manualSyncId,
        REFRESH_WINDOW: refreshWindow,
        PYTHONPATH: path.join(process.cwd()),
      };

      const child = spawn("python3", [fullPath, accountId], { env });

      child.stdout.on("data", (data) => {
        const line = data.toString();
        console.log(`[stdout][${connectorId}] ${line}`);
        const match = line.match(/ROW_COUNT=(\d+)/);
        if (match) rowCount = parseInt(match[1], 10);
      });

      child.stderr.on("data", (data) => {
        console.error(`[stderr][${connectorId}] ${data}`);
      });

      child.on("close", async (code) => {
        const duration = (Date.now() - start) / 1000;
        const connection = await connectToSnowflake();

        try {
          await insertManualSyncLog({
            connection,
            id: manualSyncId,
            accountId,
            connectorId,
            refreshWindow,
            status: code === 0 ? "success" : "error",
            rowCount,
            durationSeconds: duration,
            errorMessage: code === 0 ? null : `Script exited with code ${code}`,
          });
        } catch (err) {
          console.error("❌ Failed to insert sync log:", err);
        } finally {
          connection.destroy();
        }

        if (code === 0) {
          resolve(rowCount);
        } else {
          reject(new Error(`${scriptName} failed with code ${code}`));
        }
      });
    });
  };

  // Run all scripts in parallel
  const counts = await Promise.all(scripts.map(runScript));
  const totalRows = counts.reduce((a, b) => a + b, 0);

  return {
    connectorId,
    accountId,
    rowCount: totalRows,
  };
}
export async function runEtlForCustomer(connectorId, accountId, options = {}) {
  const { refreshWindow = "30d", manualSyncId = crypto.randomUUID() } = options;

  try {
    const result = await axios.post(
      "https://kindred-etl-service.onrender.com/run-etl",
      {
        connectorId,
        accountId,
        refreshWindow,
        manualSyncId,
      }
    );

    if (result.data.status !== "success") {
      throw new Error(`ETL failed: ${result.data.details || "Unknown error"}`);
    }

    const errorSummary = aggregateErrorSummary(result.data.errors ?? []);

    return {
      connectorId,
      accountId,
      syncedAt: result.data.completedAt ?? new Date().toISOString(),
      rowCount: result.data.rowCount ?? null,
      errorMessage: errorSummary || null,
    };
  } catch (err) {
    console.error("🔥 ETL request failed", err);
    throw new Error(`ETL call failed: ${err.message}`);
  }
}

// Helper to aggregate error types into a readable summary
function aggregateErrorSummary(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const counts = {};

  for (const err of errors) {
    const msg =
      typeof err === "string" ? err : err.error || JSON.stringify(err);
    const match = msg.match(/\b(4\d\d|5\d\d)\b/);
    const key = match
      ? `${match[0]} ${msg.includes("Timeout") ? "Timeout" : "Error"}`
      : msg.includes("Timeout")
      ? "Timeout"
      : "Unknown Error";

    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([type, count]) => `${count}× ${type}`)
    .join("\n");
}
