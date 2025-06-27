// connector-model.js
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";

/**
 * Fetches all accounts and their configured connectors, with last synced timestamp.
 * @returns {Promise<Array<{ account: { id: string, plan: string }, connectors: Array<{ id: string, lastSyncedAt: string | null }> }>>}
 */
export async function getAccountsAndConnectors() {
  const connection = await connectToSnowflake();

  const rows = await executeQuery(
    connection,
    `
    SELECT 
      a.ID AS ACCOUNT_ID,
      a.PLAN,
      c.CONNECTOR_ID,
      c.LAST_SYNCED_AT
    FROM KINDRED.PUBLIC.ACCOUNTS a
    JOIN KINDRED.PUBLIC.CONNECTOR_CONFIGS c
      ON a.ID = c.ACCOUNT_ID
    `
  );

  // Group by account
  const grouped = {};
  for (const row of rows) {
    const accountId = row.ACCOUNT_ID;
    if (!grouped[accountId]) {
      grouped[accountId] = {
        account: {
          id: accountId,
          plan: row.PLAN || "Basic",
        },
        connectors: [],
      };
    }

    grouped[accountId].connectors.push({
      id: row.CONNECTOR_ID,
      lastSyncedAt: row.LAST_SYNCED_AT,
    });
  }

  return Object.values(grouped);
}
