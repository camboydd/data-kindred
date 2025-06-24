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

const snowflakeRouter = express.Router();

// Get all Snowflake configurations for the current user/account
snowflakeRouter.get("/configs", checkAuth, getSnowflakeConfigs);

snowflakeRouter.post("/configs/auth-method", checkAuth, getAuthMethod);

snowflakeRouter.post("/configs/status", checkAuth, getSnowflakeConfigStatus);

// Create or update a Snowflake configuration
snowflakeRouter.post("/configs", checkAuth, createSnowflakeConfig);

// Test a Snowflake connection
snowflakeRouter.post("/configs/test", checkAuth, testSnowflakeConnection);

snowflakeRouter.get("/oauth/authorize", authorizeSnowflakeOAuth);
snowflakeRouter.post("/oauth/callback", handleOAuthCallback);
snowflakeRouter.post("/oauth", checkAuth, saveOAuthConfig);

// Delete a Snowflake configuration (if you support deletion)
snowflakeRouter.delete("/configs/:id", checkAuth, deleteSnowflakeConfig);

snowflakeRouter.post(
  "/configs/delete",
  checkAuth,
  deleteSnowflakeConfigsByAccount
);

export { snowflakeRouter };
