// src/jobs/autoSync.js
import { getAccountsAndConnectors } from "../models/connector-model.js";
import { runEtlForCustomer } from "../orchestrator/runEtlForCustomer.js";
import { PLAN_RULES } from "../models/plan-config.js";

export async function isEligibleForSync(connector, accountPlan) {
  if (!connector || !connector.lastSyncedAt) return true;

  const last = new Date(connector.lastSyncedAt);
  const now = new Date();

  const rules = PLAN_RULES[accountPlan] || {};
  const interval = rules.syncIntervalHours || 24;

  return now - last > interval * 60 * 60 * 1000;
}

export async function runAutoSyncs() {
  const all = await getAccountsAndConnectors(); // should return [{account, connectors: [...]}, ...]

  for (const { account, connectors } of all) {
    const plan = account.plan || "Basic";

    for (const connector of connectors) {
      const ok = await isEligibleForSync(connector, plan);

      if (!ok) continue;

      try {
        await runEtlForCustomer(connector.id, account.id, {
          manualSyncId: `auto-${Date.now()}`,
          // No refreshWindow → use last pull timestamp
        });

        console.log(`✅ Auto sync succeeded for connector ${connector.id}`);
      } catch (err) {
        console.error(
          `❌ Auto sync failed for connector ${connector.id}`,
          err.message
        );
      }
    }
  }
}
