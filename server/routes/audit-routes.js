import express from "express";
import { getAuditLogs } from "../controllers/audit-controller.js";
import { checkAuth } from "../controllers/users-controller.js";

const auditRouter = express.Router();

auditRouter.get("/", checkAuth, getAuditLogs);

export { auditRouter };
