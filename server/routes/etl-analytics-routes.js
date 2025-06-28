import express from "express";
import {
  getKpis,
  getHourlyPerformance,
  getRecentActivity,
  getDailyVolume,
} from "../controllers/etl-analytics-controller.js";
import { checkAuth } from "../controllers/users-controller.js";
import { requireValidPlan } from "../util/require-valid-plan.js";

const etlAnalyticsRouter = express.Router();

etlAnalyticsRouter.get("/kpis", checkAuth, requireValidPlan, getKpis);
etlAnalyticsRouter.get(
  "/hourly-performance",
  checkAuth,
  requireValidPlan,
  getHourlyPerformance
);
etlAnalyticsRouter.get(
  "/recent-activity",
  checkAuth,
  requireValidPlan,
  getRecentActivity
);
etlAnalyticsRouter.get(
  "/daily-volume",
  checkAuth,
  requireValidPlan,
  getDailyVolume
);

export { etlAnalyticsRouter };
