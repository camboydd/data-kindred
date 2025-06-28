import crypto from "crypto";
import axios from "axios";

export async function runEtlForCustomer(connectorId, accountId, options = {}) {
  const {
    refreshWindow, // optional, used for manual syncs
    manualSyncId = crypto.randomUUID(),
  } = options;

  try {
    const result = await axios.post(
      "https://kindred-etl-service.onrender.com/run-etl",
      {
        connectorId,
        accountId,
        ...(refreshWindow ? { refreshWindow } : {}),
        manualSyncId,
      }
    );

    if (
      result.data.status !== "success" &&
      result.data.status !== "partial_success"
    ) {
      throw new Error(`ETL failed: ${result.data.details || "Unknown error"}`);
    }

    const errorSummary = aggregateErrorSummary(result.data.errors ?? []);
    const rowCount =
      typeof result.data.rowCount === "number" ? result.data.rowCount : 0;

    return {
      connectorId,
      accountId,
      syncedAt: result.data.completedAt ?? new Date().toISOString(),
      rowCount,
      errorMessage: errorSummary || null,
    };
  } catch (err) {
    console.error("🔥 ETL request failed", err);
    throw new Error(`ETL call failed: ${err.message}`);
  }
}

function aggregateErrorSummary(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const counts = {};

  for (const err of errors) {
    const msg =
      typeof err === "string" ? err : err.error || JSON.stringify(err);
    const match = msg.match(/\b(4\d\d|5\d\d)\b/);
    const key = (() => {
      if (match) {
        const code = match[0];
        if (code.startsWith("5")) return `${code} Server Error`;
        if (code.startsWith("4")) return `${code} Client Error`;
      }
      if (msg.toLowerCase().includes("timeout")) return "Timeout";
      if (msg.toLowerCase().includes("server")) return "Server Error";
      if (msg.toLowerCase().includes("connection")) return "Connection Error";
      return "Unknown Error";
    })();

    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([type, count]) => `${count}× ${type}`)
    .join("\n");
}
