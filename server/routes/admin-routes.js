import express from "express";
import {
  getAccounts,
  getUsers,
  createAccount,
  createUser,
  deleteAccount,
  deleteUser,
} from "../controllers/admin-controller.js";
import { checkAuth } from "../controllers/users-controller.js";

const adminRouter = express.Router();

adminRouter.get("/accounts", checkAuth, getAccounts);
adminRouter.get("/users", checkAuth, getUsers);
adminRouter.post("/accounts", checkAuth, createAccount);
adminRouter.post("/users", checkAuth, createUser);
adminRouter.delete("/accounts/:accountId", checkAuth, deleteAccount);
adminRouter.delete("/users/:userId", checkAuth, deleteUser);

export { adminRouter };
