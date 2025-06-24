// orchestrator/runAllConnectors.js
import { getActiveConnectorConfigs } from './getActiveConfigs.js';
import { runEtlForCustomer } from './runEtlForCustomer.js';

/**
 * Triggers ETL for every (connectorId, accountId) combo in the config DB.
 * This is intended to run all connectors for all customers in parallel.
 */
export async function runAllEtls(req, res) {
  try {
    const configs = await getActiveConnectorConfigs(); // [{ CONNECTOR_ID, ACCOUNT_ID }, ...]

    console.log(`🚀 Launching ETL for ${configs.length} connector-customer pairs.`);

    const tasks = configs.map(({ CONNECTOR_ID, ACCOUNT_ID }) =>
      runEtlForCustomer(CONNECTOR_ID.toLowerCase(), ACCOUNT_ID)
        .catch(err => err) // Allow failures in individual tasks
    );

    const results = await Promise.allSettled(tasks);

    const summary = results.map((result, i) => {
      const { CONNECTOR_ID, ACCOUNT_ID } = configs[i];
      if (result.status === 'fulfilled') {
        return { connectorId: CONNECTOR_ID, accountId: ACCOUNT_ID, status: 'success' };
      } else {
        return {
          connectorId: CONNECTOR_ID,
          accountId: ACCOUNT_ID,
          status: 'error',
          error: result.reason?.message || String(result.reason),
        };
      }
    });

    console.table(summary);
    res.status(200).json({ message: 'ETL run complete', summary });

  } catch (err) {
    console.error("❌ ETL orchestration failed:", err);
    res.status(500).send("ETL orchestration error");
  }
}
