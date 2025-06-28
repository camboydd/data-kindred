import express from "express";
import {
  runAllEtls,
  runRefreshForCustomer,
} from "../controllers/run-controller.js";
import { checkAuth } from "../controllers/users-controller.js";
import { requireValidPlan } from "../util/require-valid-plan.js";
import { checkManualSyncLimit } from "../util/checkManualSyncLimit.js";

const runRouter = express.Router();

// Orchestrator routes
runRouter.post("/all", checkAuth, requireValidPlan, runAllEtls);
runRouter.post(
  "/refresh/:accountId",
  checkAuth,
  requireValidPlan,
  checkManualSyncLimit,
  runRefreshForCustomer
);

export { runRouter };
