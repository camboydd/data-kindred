import express from "express";
import {
  getKpis,
  getHourlyPerformance,
  getRecentActivity,
  getDailyVolume
} from "../controllers/etl-analytics-controller.js";
import { checkAuth } from "../controllers/users-controller.js";

const etlAnalyticsRouter = express.Router();

etlAnalyticsRouter.get("/kpis", checkAuth, getKpis);
etlAnalyticsRouter.get("/hourly-performance", checkAuth, getHourlyPerformance);
etlAnalyticsRouter.get("/recent-activity", checkAuth, getRecentActivity);
etlAnalyticsRouter.get("/daily-volume", checkAuth, getDailyVolume);

export { etlAnalyticsRouter };
