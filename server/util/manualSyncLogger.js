import { executeQuery } from "./snowflake-connection.js";

export async function insertManualSyncLog({
  connection,
  id,
  accountId,
  connectorId,
  refreshWindow,
  status,
  rowCount = 0,
  durationSeconds = null,
  errorMessage = null,
}) {
  return executeQuery(
    connection,
    `
    INSERT INTO KINDRED.PUBLIC.MANUAL_SYNC_LOGS
      (ID, ACCOUNT_ID, CONNECTOR_ID, REFRESH_WINDOW, STATUS, ROW_COUNT, DURATION_SECONDS, ERROR_MESSAGE, CREATED_AT, STARTED_AT, COMPLETED_AT)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `,
    [
      id,
      accountId,
      connectorId,
      refreshWindow,
      status,
      rowCount,
      durationSeconds,
      errorMessage,
    ]
  );
}
