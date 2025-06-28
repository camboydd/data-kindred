// util/checkManualSyncLimit.js
import { PLAN_RULES } from "../models/plan-config.js";
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";

export const checkManualSyncLimit = async (req, res, next) => {
  const { accountId, plan } = req.user;
  const { connectorId } = req.body;

  if (!accountId || !plan || !connectorId) {
    return res.status(400).json({
      success: false,
      message: "Missing account ID, plan, or connector ID.",
    });
  }

  const limit = PLAN_RULES[plan]?.manualSyncLimitPerConnectorPerDay;

  // If unlimited or undefined, allow
  if (limit === undefined || limit === Infinity) {
    return next();
  }

  try {
    const conn = await connectToSnowflake();
    const result = await executeQuery(
      conn,
      `
      SELECT COUNT(*) AS count
      FROM KINDRED.PUBLIC.MANUAL_SYNC_LOGS
      WHERE ACCOUNT_ID = ?
        AND CONNECTOR_ID = ?
        AND DATE("STARTED_AT") = CURRENT_DATE()
      `,
      [accountId, connectorId]
    );

    const syncCountToday = result?.[0]?.COUNT ?? 0;

    if (syncCountToday >= limit) {
      return res.status(429).json({
        success: false,
        message: `Manual sync limit reached for today (${limit} per connector). Try again tomorrow.`,
      });
    }

    return next();
  } catch (err) {
    console.error("❌ Failed to check manual sync limit:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to enforce manual sync limits.",
    });
  }
};
