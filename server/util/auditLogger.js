import { v4 as uuidv4 } from "uuid";
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";

/**
 * Logs an audit event to the AUDIT_LOGS table.
 *
 * @param {Object} params
 * @param {string} params.accountId - The account ID tied to the user/session
 * @param {string} params.actorEmail - Email of the user or system triggering the event
 * @param {string} params.action - Event type (e.g. 'triggered_run', 'updated_config')
 * @param {string} [params.targetEntity] - ID of the entity being acted on (e.g. connectorId)
 * @param {string} [params.status='success'] - Event status ('success', 'fail')
 * @param {Object} [params.metadata={}] - Additional details
 */
export async function logAuditEvent({
  accountId,
  actorEmail,
  action,
  targetEntity = null,
  status = "success",
  metadata = {},
}) {
  const auditId = uuidv4();
  const metadataJson = JSON.stringify(metadata).replace(/'/g, "''"); // escape single quotes

  const sql = `
    INSERT INTO KINDRED.PUBLIC.AUDIT_LOGS (
      ID, TIMESTAMP, ACCOUNT_ID, ACTOR_EMAIL, ACTION, TARGET_ENTITY, STATUS, METADATA
    )
    SELECT ?, CURRENT_TIMESTAMP(), ?, ?, ?, ?, ?, PARSE_JSON('${metadataJson}')
  `;

  const binds = [auditId, accountId, actorEmail, action, targetEntity, status];

  try {
    const conn = await connectToSnowflake();
    await executeQuery(conn, sql, binds);
  } catch (err) {
    console.error("❌ Failed to write audit log:", err.message);
    // Do not throw — audit logs should not block core app behavior
  }
}
