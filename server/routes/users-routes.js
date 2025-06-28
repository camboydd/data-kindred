import express from "express";
import {
  login,
  logout,
  createCheckoutSession,
  signup,
  setupPassword,
  resetPassword,
  requestPasswordReset,
  requestAccess,
  checkAuth,
  updateUser,
  upgradePlan,
} from "../controllers/users-controller.js";

// import { getUsers, getCustomersByUserEmail } from "../controllers/users-controller.js";

const userRouter = express.Router();

userRouter.get("/check-auth", checkAuth, (req, res) => {
  res.status(200).json({ user: req.user });
});

// Public routes
userRouter.post("/login", login);
userRouter.post("/upgrade", checkAuth, upgradePlan);
userRouter.get("/create-checkout-session", createCheckoutSession);
userRouter.post("/signup", signup);
userRouter.post("/logout", checkAuth, logout);
userRouter.post("/setup-password", setupPassword);
userRouter.post("/reset-password", resetPassword); // no token in the path
userRouter.post("/request-password-reset", requestPasswordReset);
userRouter.post("/request-access", requestAccess);
userRouter.post("/update", checkAuth, updateUser);

// Example placeholder for other user routes
// userRouter.get("/", getUsers);
// userRouter.get("/customers", getCustomersByUserEmail);

export { userRouter };
