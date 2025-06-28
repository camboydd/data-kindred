import { PLAN_RULES } from "../models/plan-config.js";
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";

export const checkConnectorLimit = async (req, res, next) => {
  const { accountId, plan } = req.user;

  if (!accountId || !plan) {
    return res.status(400).json({ message: "Missing user context." });
  }

  const rule = PLAN_RULES[plan];
  if (!rule) return res.status(403).json({ message: "Unknown plan." });

  try {
    const conn = await connectToSnowflake();
    const result = await executeQuery(
      conn,
      `SELECT COUNT(*) AS count FROM KINDRED.PUBLIC.CONNECTORS WHERE ACCOUNT_ID = ?`,
      [accountId]
    );
    const currentCount = result[0]?.COUNT ?? 0;

    if (currentCount >= rule.maxConnectors) {
      return res.status(403).json({
        message: `Your plan (${plan}) allows up to ${rule.maxConnectors} connectors.`,
      });
    }

    next();
  } catch (err) {
    console.error("❌ Failed to enforce connector limit:", err);
    res
      .status(500)
      .json({ message: "Server error enforcing connector limit." });
  }
};
