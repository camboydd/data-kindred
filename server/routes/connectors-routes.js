// routes/connectors-routes.js
import express from "express";
import {
  getConnectorConfig,
  createOrUpdateConnectorConfig,
  testConnectorConnection,
  getConnectorStatus,
  getAllConnectorStatuses,
  getAllConnectorConfigs,
  deleteConnectorConfig,
  triggerManualSync,
  getManualSyncLogs,
} from "../controllers/connectors-controller.js";
import { checkAuth } from "../controllers/users-controller.js";
import { checkConnectorLimit } from "../util/check-connector-limit.js";

const connectorsRouter = express.Router();

connectorsRouter.post("/:id/config", checkAuth, getConnectorConfig);

// 🔒 Apply limit only to setup endpoint
connectorsRouter.post(
  "/setup",
  checkAuth,
  checkConnectorLimit,
  createOrUpdateConnectorConfig
);

connectorsRouter.post("/:id/test", checkAuth, testConnectorConnection);
connectorsRouter.post("/:id/status", checkAuth, getConnectorStatus);
connectorsRouter.get("/statuses", checkAuth, getAllConnectorStatuses);
connectorsRouter.get("/configs", checkAuth, getAllConnectorConfigs);
connectorsRouter.post("/:id/delete", checkAuth, deleteConnectorConfig);
connectorsRouter.post("/sync/manual", checkAuth, triggerManualSync);
connectorsRouter.get("/sync/manual/logs", checkAuth, getManualSyncLogs);

export { connectorsRouter };
