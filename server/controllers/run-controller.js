import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import HttpError from "../models/http-error.js";
import { runEtlForCustomer } from "../orchestrator/runEtlForCustomer.js";
import { logAuditEvent } from "../util/auditLogger.js";

/**
 * GET /etl/run/all
 * Run ETLs for all configured connector-account pairs
 */
export async function runAllEtls(req, res, next) {
  let connection;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  try {
    connection = await connectToSnowflake();

    const sql = `
      SELECT ACCOUNT_ID, CONNECTOR_ID
      FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
    `;

    const rows = await executeQuery(connection, sql);
    console.log(`🔁 Launching ${rows.length} ETL jobs...`);

    const jobs = rows.map(({ CONNECTOR_ID, ACCOUNT_ID }) =>
      runEtlForCustomer(CONNECTOR_ID.toLowerCase(), ACCOUNT_ID)
        .then(async () => {
          await logAuditEvent({
            accountId: ACCOUNT_ID, // target customer
            actorEmail: req.user?.email || "system", // initiator
            initiatorAccountId: req.user?.accountId,
            initiatorEmail: req.user?.email,
            action: "etl_run_individual",
            targetEntity: `${ACCOUNT_ID}:${CONNECTOR_ID}`,
            status: "success",
            metadata: { ip },
          });
          return {
            connectorId: CONNECTOR_ID,
            accountId: ACCOUNT_ID,
            status: "success",
          };
        })
        .catch(async (err) => {
          console.error(
            `❌ ETL failed for ${ACCOUNT_ID} / ${CONNECTOR_ID}:`,
            err.message
          );
          await logAuditEvent({
            accountId: ACCOUNT_ID, // target customer
            actorEmail: req.user?.email || "system", // initiator
            initiatorAccountId: req.user?.accountId,
            initiatorEmail: req.user?.email,
            action: "etl_run_individual",
            targetEntity: `${ACCOUNT_ID}:${CONNECTOR_ID}`,
            status: "fail",
            metadata: {
              error: err.message,
              ip,
            },
          });
          return {
            connectorId: CONNECTOR_ID,
            accountId: ACCOUNT_ID,
            status: "error",
            error: err.message,
          };
        })
    );

    const results = await Promise.allSettled(jobs);
    const summary = results.map((r) => r.value || r.reason);

    console.log("📋 ETL Summary:");
    console.table(summary);

    res.status(200).json({ message: "ETL run complete", summary });
  } catch (err) {
    console.error("❌ ETL orchestration error:", err);

    await logAuditEvent({
      accountId: accountId, // target
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "etl_run_all_accounts",
      targetEntity: "all_accounts",
      status: "fail",
      metadata: {
        error: err.message,
        ip,
      },
    });

    return next(new HttpError("ETL orchestration failed", 500));
  } finally {
    if (connection) {
      connection.destroy();
    }
  }
}

/**
 * POST /etl/run/refresh/:accountId
 * Run FULL REFRESH ETLs for all connectors tied to the given account
 */
export async function runRefreshForCustomer(req, res, next) {
  const accountId = req.params.accountId;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  let connection;

  try {
    connection = await connectToSnowflake();

    const sql = `
      SELECT CONNECTOR_ID
      FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
      WHERE ACCOUNT_ID = ?
    `;

    const rows = await executeQuery(connection, sql, [accountId]);

    if (!rows || rows.length === 0) {
      return next(
        new HttpError(`No connectors found for account ${accountId}`, 404)
      );
    }

    const jobs = rows.map(({ CONNECTOR_ID }) =>
      runEtlForCustomer(CONNECTOR_ID.toLowerCase(), accountId, {
        fullRefresh: true,
      })
        .then(() => ({
          connectorId: CONNECTOR_ID,
          accountId,
          status: "success",
        }))
        .catch((err) => ({
          connectorId: CONNECTOR_ID,
          accountId,
          status: "error",
          error: err.message,
        }))
    );

    const results = await Promise.allSettled(jobs);
    const summary = results.map((r) => r.value || r.reason);

    console.log(`🔁 Full Refresh ETL Summary for ${accountId}:`);
    console.table(summary);

    await logAuditEvent({
      accountId: accountId, // target
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "full_refresh_etl_run",
      targetEntity: accountId,
      status: "success",
      metadata: {
        connectorCount: rows.length,
        summary,
        ip,
      },
    });

    res.status(200).json({
      message: `Full refresh ETL run complete for ${accountId}`,
      summary,
    });
  } catch (err) {
    console.error("❌ Full refresh ETL error:", err);

    await logAuditEvent({
      accountId: accountId, // target
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "full_refresh_etl_run",
      targetEntity: accountId,
      status: "fail",
      metadata: {
        error: err.message,
        ip,
      },
    });

    return next(new HttpError("Full refresh ETL failed", 500));
  } finally {
    if (connection) {
      connection.destroy();
    }
  }
}
