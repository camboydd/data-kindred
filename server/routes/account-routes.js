import express from "express";
import { checkAuth } from "../controllers/users-controller.js";
import {
  openBillingPortal,
  getInvoices,
  cancelSubscription,
  upgradePlan,
} from "../controllers/account-controller.js";

const accountRouter = express.Router();

accountRouter.post("/portal", checkAuth, openBillingPortal);
accountRouter.get("/invoices", checkAuth, getInvoices);
accountRouter.post("/cancel-subscription", checkAuth, cancelSubscription);
accountRouter.post("/upgrade", checkAuth, upgradePlan); // ← added

export { accountRouter };
