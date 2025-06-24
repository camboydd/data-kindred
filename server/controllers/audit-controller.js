import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import HttpError from "../models/http-error.js";

const getAuditLogs = async (req, res, next) => {
  try {
    const { email, role, accountId } = req.user || {};

    console.log("🔍 User context:", req.user);

    if (!email || !role || !accountId) {
      return next(new HttpError("Unauthorized: missing user details.", 401));
    }

    const conn = await connectToSnowflake();

    // Always scope by ACCOUNT_ID
    let sql = `SELECT * FROM KINDRED.PUBLIC.AUDIT_LOGS WHERE ACCOUNT_ID = ?`;
    const binds = [accountId];

    // If not admin or developer, also filter by ACTOR_EMAIL
    if (role !== "admin" && role !== "developer") {
      sql += ` AND LOWER(ACTOR_EMAIL) = LOWER(?)`;
      binds.push(email);
    }

    sql += ` ORDER BY TIMESTAMP DESC LIMIT 100`;

    const auditLogs = await executeQuery(conn, sql, binds);

    res.status(200).json(auditLogs);
  } catch (err) {
    console.error("❌ Error fetching audit logs:", err);
    return next(new HttpError("Fetching audit logs failed.", 500));
  }
};

export { getAuditLogs };
