import express from "express";
import {
  getSnowflakeConfigs,
  createSnowflakeConfig,
  testSnowflakeConnection,
  deleteSnowflakeConfig,
  getSnowflakeConfigStatus,
  authorizeSnowflakeOAuth,
  handleOAuthCallback,
  saveOAuthConfig,
  getAuthMethod,
  deleteSnowflakeConfigsByAccount,
} from "../controllers/snowflake-controller.js";
import { checkAuth } from "../controllers/users-controller.js";
import { requireValidPlan } from "../util/require-valid-plan.js";

const snowflakeRouter = express.Router();

// Protected routes requiring both authentication and valid plan
snowflakeRouter.get(
  "/configs",
  checkAuth,
  requireValidPlan,
  getSnowflakeConfigs
);
snowflakeRouter.post(
  "/configs/auth-method",
  checkAuth,
  requireValidPlan,
  getAuthMethod
);
snowflakeRouter.post(
  "/configs/status",
  checkAuth,
  requireValidPlan,
  getSnowflakeConfigStatus
);
snowflakeRouter.post(
  "/configs",
  checkAuth,
  requireValidPlan,
  createSnowflakeConfig
);
snowflakeRouter.post(
  "/configs/test",
  checkAuth,
  requireValidPlan,
  testSnowflakeConnection
);
snowflakeRouter.post("/oauth", checkAuth, requireValidPlan, saveOAuthConfig);
snowflakeRouter.delete(
  "/configs/:id",
  checkAuth,
  requireValidPlan,
  deleteSnowflakeConfig
);
snowflakeRouter.post(
  "/configs/delete",
  checkAuth,
  requireValidPlan,
  deleteSnowflakeConfigsByAccount
);

// Public routes (no auth required)
snowflakeRouter.get("/oauth/authorize", authorizeSnowflakeOAuth);
snowflakeRouter.post("/oauth/callback", handleOAuthCallback);

export { snowflakeRouter };
