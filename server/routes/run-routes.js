import express from "express";
import {
  runAllEtls,
  runRefreshForCustomer,
} from "../controllers/run-controller.js";
import { checkAuth } from "../controllers/users-controller.js";
const runRouter = express.Router();

// Orchestrator routes
runRouter.post("/all", checkAuth, runAllEtls);
runRouter.post("/refresh/:accountId", checkAuth, runRefreshForCustomer); // ← NEW

export { runRouter };
