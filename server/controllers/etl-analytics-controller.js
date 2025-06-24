import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import HttpError from "../models/http-error.js";

// GET /etl/kpis
const getKpis = async (req, res, next) => {
  try {
    const connection = await connectToSnowflake();
    const accountId = req.user.accountId;

    const [kpiRows, connectorRows] = await Promise.all([
      executeQuery(
        connection,
        `
    SELECT
      COUNT(*) AS TOTAL_RUNS,
      COUNT(DISTINCT CASE WHEN STATUS = 'success' THEN RUN_SESSION_ID END) AS SUCCESSFUL_RUNS,
      COUNT(DISTINCT CASE WHEN STATUS = 'error' THEN RUN_SESSION_ID END) AS ERROR_COUNT,
      SUM(ROW_COUNT) AS TOTAL_ROWS,
      ROUND(
        100.0 * COUNT(DISTINCT CASE WHEN STATUS = 'success' THEN RUN_SESSION_ID END) / NULLIF(COUNT(DISTINCT RUN_SESSION_ID), 0),
        2
      ) AS SUCCESS_RATE,
      MAX(RUN_TIMESTAMP) AS LAST_RUN,
      COUNT(DISTINCT CONNECTOR_ID) AS ACTIVE_INTEGRATIONS
    FROM KINDRED.PUBLIC.RUN_LOG
    WHERE ACCOUNT_ID = ? AND RUN_TIMESTAMP >= DATEADD(day, -7, CURRENT_TIMESTAMP())
      AND CONNECTOR_ID IS NOT NULL
  `,
        [accountId]
      ),

      executeQuery(
        connection,
        `
    SELECT DISTINCT CONNECTOR_ID
    FROM KINDRED.PUBLIC.RUN_LOG
    WHERE ACCOUNT_ID = ? AND RUN_TIMESTAMP >= DATEADD(day, -7, CURRENT_TIMESTAMP())
      AND CONNECTOR_ID IS NOT NULL
  `,
        [accountId]
      ),
    ]);

    const kpis = kpiRows[0];
    res.status(200).json({
      totalRuns: kpis.TOTAL_RUNS,
      successfulRuns: kpis.SUCCESSFUL_RUNS,
      errorCount: kpis.ERROR_COUNT,
      totalRows: kpis.TOTAL_ROWS,
      successRate: kpis.SUCCESS_RATE,
      lastRun: kpis.LAST_RUN,
      activeIntegrations: kpis.ACTIVE_INTEGRATIONS,
      connectorsUsed: connectorRows.map((row) => row.CONNECTOR_ID),
    });
  } catch (err) {
    console.error("❌ Error fetching KPIs:", err);
    return next(new HttpError("Fetching KPI data failed.", 500));
  }
};

// GET /etl/hourly-performance
const getHourlyPerformance = async (req, res, next) => {
  try {
    const connection = await connectToSnowflake();
    const accountId = req.user.accountId;

    const rows = await executeQuery(
      connection,
      `
  SELECT
    LPAD(TO_CHAR(RUN_TIMESTAMP, 'HH24'), 2, '0') AS HOUR,
    COUNT(DISTINCT CASE WHEN STATUS = 'success' THEN RUN_SESSION_ID END) AS SUCCESSFUL,
    COUNT(DISTINCT CASE WHEN STATUS = 'error' THEN RUN_SESSION_ID END) AS FAILED
  FROM KINDRED.PUBLIC.RUN_LOG
  WHERE ACCOUNT_ID = ? AND RUN_TIMESTAMP >= DATEADD(day, -1, CURRENT_TIMESTAMP())
    AND CONNECTOR_ID IS NOT NULL
  GROUP BY 1
  ORDER BY 1
`,
      [accountId]
    );

    const formattedData = rows.map((row) => ({
      time: `${row.HOUR}:00`,
      successful: row.SUCCESSFUL,
      failed: row.FAILED,
    }));

    res.status(200).json(formattedData);
  } catch (err) {
    console.error("❌ Error fetching hourly performance:", err);
    return next(new HttpError("Fetching hourly performance failed.", 500));
  }
};

// GET /etl/recent-activity
const getRecentActivity = async (req, res, next) => {
  try {
    const connection = await connectToSnowflake();

    const accountId = req.user.accountId;

    const rows = await executeQuery(
      connection,
      `
  SELECT
    RUN_SESSION_ID,
    ACCOUNT_ID,
    CONNECTOR_ID,
    MAX(RUN_TIMESTAMP) AS LAST_RUN,
    MAX(ROW_COUNT) AS LAST_ROW_COUNT,
    MAX(ERROR_MESSAGE) AS LAST_ERROR,
    MAX(STATUS) AS LAST_STATUS
  FROM KINDRED.PUBLIC.RUN_LOG
  WHERE ACCOUNT_ID = ? AND CONNECTOR_ID IS NOT NULL
  GROUP BY RUN_SESSION_ID, ACCOUNT_ID, CONNECTOR_ID
  ORDER BY LAST_RUN DESC
  LIMIT 10;
`,
      [accountId]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error("❌ Error fetching recent activity:", err);
    return next(new HttpError("Fetching recent activity failed.", 500));
  }
}; // GET /etl/daily-volume
// GET /etl/daily-volume
const getDailyVolume = async (req, res, next) => {
  try {
    const connection = await connectToSnowflake();

    const accountId = req.user.accountId;

    const rows = await executeQuery(
      connection,
      `
  SELECT
    TO_DATE(CONVERT_TIMEZONE('UTC', 'America/New_York', RUN_TIMESTAMP)) AS RUN_DATE,
    SUM(ROW_COUNT) AS TOTAL_ROWS
  FROM KINDRED.PUBLIC.RUN_LOG
  WHERE ACCOUNT_ID = ? AND RUN_TIMESTAMP >= DATEADD(day, -7, CURRENT_TIMESTAMP())
  GROUP BY RUN_DATE
  ORDER BY RUN_DATE
`,
      [accountId]
    );

    const resultMap = Object.fromEntries(
      rows.map((r) => [r.RUN_DATE.toISOString().split("T")[0], r.TOTAL_ROWS])
    );

    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - i));
      return date.toISOString().split("T")[0];
    });

    const padded = days.map((dateStr) => ({
      date: dateStr,
      totalRows: resultMap[dateStr] ?? 0,
    }));

    res.status(200).json(padded);
  } catch (err) {
    console.error("❌ Error fetching daily volume:", err);
    return next(new HttpError("Fetching daily sync volume failed.", 500));
  }
};

export { getKpis, getHourlyPerformance, getRecentActivity, getDailyVolume };
