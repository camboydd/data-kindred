import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "../models/user-model.js";
import HttpError from "../models/http-error.js";
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import crypto from "node:crypto";
import { sendEmail } from "../util/send-email.js";
import { logAuditEvent } from "../util/auditLogger.js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { createStripeCustomer } from "../util/stripe.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const upgradePlan = async (req, res, next) => {
  const accountId = req.user?.accountId;
  const email = req.user?.email;
  const { priceId } = req.body;

  if (!priceId || !accountId) {
    return next(new HttpError("Missing priceId or accountId.", 400));
  }

  try {
    const connection = await connectToSnowflake();
    const accountResult = await executeQuery(
      connection,
      `SELECT STRIPE_CUSTOMER_ID FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );

    const stripeCustomerId = accountResult?.[0]?.STRIPE_CUSTOMER_ID;

    if (!stripeCustomerId) {
      return next(new HttpError("Stripe customer not found for account.", 404));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { accountId, upgradedFrom: req.user?.plan || "unknown" },
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=success`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ Error starting upgrade session:", err);
    return next(new HttpError("Upgrade failed. Try again later.", 500));
  }
};

const createCheckoutSession = async (req, res, next) => {
  const { priceId } = req.query;
  const accountId = req.user?.accountId;
  const email = req.user?.email;

  if (!priceId || !accountId) {
    return next(new HttpError("Missing priceId or accountId.", 400));
  }

  try {
    const connection = await connectToSnowflake();
    const accountResult = await executeQuery(
      connection,
      `SELECT STRIPE_CUSTOMER_ID FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );

    const stripeCustomerId = accountResult?.[0]?.STRIPE_CUSTOMER_ID;

    if (!stripeCustomerId) {
      return next(new HttpError("Stripe customer not found for account.", 404));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { accountId },
      success_url: `${process.env.FRONTEND_URL}/dashboard?checkout=success`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?checkout=cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ Error creating Stripe Checkout Session:", err);
    return next(new HttpError("Could not start Stripe Checkout.", 500));
  }
};

const signup = async (req, res, next) => {
  const { email, password, name, company } = req.body;

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!email || !password || !name) {
    return next(new HttpError("Email, name, and password are required.", 422));
  }

  const accountId = uuidv4();
  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 12);
  const planParam = req.body.plan?.toLowerCase() || "basic";
  const plan = ["basic", "pro", "enterprise"].includes(planParam)
    ? planParam.charAt(0).toUpperCase() + planParam.slice(1)
    : "Basic";

  try {
    const connection = await connectToSnowflake();

    // 1. Insert account first
    await executeQuery(
      connection,
      `INSERT INTO KINDRED.PUBLIC.ACCOUNTS (ID, NAME, PLAN) VALUES (?, ?, ?)`,
      [accountId, company || name, plan]
    );

    // 2. Create Stripe customer
    const stripeCustomerId = await createStripeCustomer({
      name: company || name,
      email,
      accountId,
    });

    await executeQuery(
      connection,
      `UPDATE KINDRED.PUBLIC.ACCOUNTS SET STRIPE_CUSTOMER_ID = ? WHERE ID = ?`,
      [stripeCustomerId, accountId]
    );

    // 3. Insert user
    await executeQuery(
      connection,
      `INSERT INTO KINDRED.PUBLIC.USERS (ID, EMAIL, NAME, PASSWORD_HASH, ACCOUNT_ID) VALUES (?, ?, ?, ?, ?)`,
      [userId, email, name, hashedPassword, accountId]
    );

    // 4. (Optional) auto-login and issue token
    const token = jwt.sign(
      {
        userId,
        email,
        accountId,
        role: "member",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 3600000,
    });

    await logAuditEvent({
      accountId,
      initiatorEmail: email,
      initiatorAccountId: accountId,
      actorEmail: email,
      action: "signup",
      targetEntity: userId,
      status: "success",
      metadata: { ip, planRequested: planParam },
    });

    await sendEmail(
      email,
      "Welcome to DataKindred!",
      `
      <h2>Welcome, ${name} 👋</h2>
      <p>Your Kindred account has been created successfully under the <strong>${planParam}</strong> plan.</p>
      <p>You can now set up your integrations and begin syncing data.</p>
      <br/>
      <p style="color: #94a3b8; font-size: 14px;">Thanks,<br/>The Kindred Team</p>
      `
    );

    res.status(201).json({
      message: "Account and user created successfully.",
      user: { email, account_id: accountId, role: "member" },
    });
  } catch (err) {
    console.error("❌ Signup failed:", err);
    return next(new HttpError("Signup failed. Try again later.", 500));
  }
};

const verifyCaptcha = async (token) => {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const response = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`
  );
  return response.data.success;
};
const login = async (req, res, next) => {
  let { email, password } = req.body;

  console.log("[LOGIN] Received login request:", { email });

  if (!email || !password) {
    console.warn("[LOGIN] Missing credentials");
    return res.status(422).json({
      success: false,
      message: "Email and password are required.",
      code: "MISSING_CREDENTIALS",
    });
  }

  email = email.toLowerCase().trim();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  try {
    console.log("[LOGIN] Looking up user by email:", email);
    const user = await getUserByEmail(email);
    console.log("[LOGIN] User lookup result:", user);

    if (!user) {
      console.warn("[LOGIN] No user found with email:", email);
      await logAuditEvent({
        accountId: null,
        initiatorAccountId: null,
        initiatorEmail: email,
        actorEmail: email,
        action: "login",
        targetEntity: email,
        status: "fail",
        metadata: { reason: "user_not_found", ip },
      });

      return res.status(401).json({
        message: "Invalid email or password.",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.account_id) {
      console.error("[LOGIN] User has no account_id! Failing login.");
      return res.status(500).json({
        message: "User misconfiguration (missing account ID).",
        code: "MISSING_ACCOUNT_ID",
      });
    }

    console.log("[LOGIN] Checking password for user:", user.email);
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    console.log("[LOGIN] Password match result:", isValidPassword);

    if (!isValidPassword) {
      console.warn("[LOGIN] Invalid password for:", user.email);
      await logAuditEvent({
        accountId: user.account_id,
        initiatorAccountId: user.account_id,
        initiatorEmail: user.email,
        actorEmail: user.email,
        action: "login",
        targetEntity: user.id,
        status: "fail",
        metadata: { reason: "invalid_password", ip },
      });

      return res.status(401).json({
        message: "Invalid email or password.",
        code: "INVALID_PASSWORD",
      });
    }

    // 🔍 Fetch plan from Snowflake
    let plan = undefined;
    try {
      const conn = await connectToSnowflake();
      const result = await executeQuery(
        conn,
        `SELECT PLAN FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
        [user.account_id]
      );
      plan = result?.[0]?.PLAN;
      console.log("[LOGIN] Retrieved plan:", plan);
    } catch (err) {
      console.error("[LOGIN] Failed to fetch plan:", err);
      // continue anyway with no plan
    }

    console.log("[LOGIN] Password validated. Signing JWT...");
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        accountId: user.account_id,
        role: user.role,
        ...(plan && { plan }), // only include if defined
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    console.log("[LOGIN] JWT generated. Setting cookie...");
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 3600000,
    });

    console.log("[LOGIN] Logging success audit event...");
    await logAuditEvent({
      accountId: user.account_id,
      initiatorAccountId: user.account_id,
      initiatorEmail: user.email,
      actorEmail: user.email,
      action: "login",
      targetEntity: user.id,
      status: "success",
      metadata: { ip },
    });

    console.log("[LOGIN] Returning success response.");
    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        email: user.email,
        role: user.role,
        accountId: user.account_id,
        ...(plan && { plan }), // ⬅️ include plan in response
      },
    });
  } catch (err) {
    console.error("[LOGIN] Unexpected error during login:", err);
    return next(new HttpError("Unexpected login error.", 500));
  }
};
const logout = async (req, res, next) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Strict",
  });

  await logAuditEvent({
    accountId: req.user?.accountId,
    initiatorAccountId: req.user?.accountId,
    initiatorEmail: req.user?.email,
    actorEmail: req.user?.email || "unknown",
    action: "logout",
    targetEntity: req.user?.id || "unknown",
    status: "success",
    metadata: { ip },
  });

  res.status(200).json({ message: "Logged out successfully" });
};

const checkAuth = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    console.warn("🔒 No token found in cookies.");
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.accountId) {
      console.warn("⚠️ Decoded JWT missing accountId:", decoded);
      return res.status(401).json({ message: "Invalid token payload" });
    }

    const user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      accountId: decoded.accountId,
    };

    // 🔍 Fetch plan from Snowflake
    try {
      const conn = await connectToSnowflake();
      const result = await executeQuery(
        conn,
        `SELECT PLAN FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
        [user.accountId]
      );

      const plan = result?.[0]?.PLAN;
      if (plan) {
        user.plan = plan;
      } else {
        console.warn("⚠️ No plan found for account:", user.accountId);
      }
    } catch (planErr) {
      console.error("❌ Failed to fetch plan during auth:", planErr);
      // still allow auth, but without plan
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("❌ JWT verification failed:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
};

const setupPassword = async (req, res, next) => {
  const { token, password } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!token || !password) {
    return next(new HttpError("Token and password are required.", 422));
  }

  try {
    const connection = await connectToSnowflake();
    const result = await executeQuery(
      connection,
      `
      SELECT ID, EMAIL FROM KINDRED.PUBLIC.USERS 
      WHERE RESET_TOKEN = ? AND RESET_EXPIRES_AT > CURRENT_TIMESTAMP()
    `,
      [token]
    );

    if (!result.length) {
      return next(new HttpError("Invalid or expired token.", 400));
    }

    const userId = result[0].ID;
    const email = result[0].EMAIL;
    const hashed = await bcrypt.hash(password, 12);

    await executeQuery(
      connection,
      `
      UPDATE KINDRED.PUBLIC.USERS 
      SET PASSWORD_HASH = ?, RESET_TOKEN = NULL, RESET_EXPIRES_AT = NULL 
      WHERE ID = ?
    `,
      [hashed, userId]
    );

    await logAuditEvent({
      accountId: req.user?.accountId || null,
      initiatorAccountId: req.user?.accountId || null,
      initiatorEmail: req.user?.email || email,
      actorEmail: email,
      action: "password_set",
      targetEntity: userId,
      status: "success",
      metadata: { ip, method: "token" },
    });

    res.status(200).json({ message: "Password set successfully." });
  } catch (err) {
    return next(new HttpError("Password setup failed.", 500));
  }
};

const resetPassword = async (req, res, next) => {
  const { password } = req.body;
  const { token } = req.query;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!token || !password) {
    return next(new HttpError("Token and new password are required.", 422));
  }

  try {
    const connection = await connectToSnowflake();
    const result = await executeQuery(
      connection,
      `
      SELECT ID, EMAIL FROM KINDRED.PUBLIC.USERS 
      WHERE RESET_TOKEN = ? AND RESET_EXPIRES_AT > CURRENT_TIMESTAMP()
    `,
      [token]
    );

    if (!result.length) {
      return next(new HttpError("Invalid or expired token.", 400));
    }

    const userId = result[0].ID;
    const email = result[0].EMAIL;
    const hashed = await bcrypt.hash(password, 12);

    await executeQuery(
      connection,
      `
      UPDATE KINDRED.PUBLIC.USERS 
      SET PASSWORD_HASH = ?, RESET_TOKEN = NULL, RESET_EXPIRES_AT = NULL 
      WHERE ID = ?
    `,
      [hashed, userId]
    );

    await logAuditEvent({
      accountId: req.user?.accountId || null,
      initiatorAccountId: req.user?.accountId || null,
      initiatorEmail: req.user?.email || email,
      actorEmail: email,
      action: "password_reset",
      targetEntity: userId,
      status: "success",
      metadata: { ip, method: "token" },
    });

    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (err) {
    return next(new HttpError("Reset failed, please try again later.", 500));
  }
};

const requestPasswordReset = async (req, res, next) => {
  let { email } = req.body;
  email = email.toLowerCase().trim();

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!email) {
    return next(new HttpError("Email is required.", 422));
  }

  try {
    const user = await getUserByEmail(email);
    if (!user) {
      await logAuditEvent({
        accountId: null,
        initiatorEmail: email,
        initiatorAccountId: null,
        actorEmail: email,
        action: "reset_requested",
        targetEntity: "unknown_user",
        status: "fail",
        metadata: { ip, outcome: "no_user_found" },
      });

      return res
        .status(200)
        .json({ message: "If an account exists, a reset link has been sent." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

    const connection = await connectToSnowflake();
    await executeQuery(
      connection,
      `
      UPDATE KINDRED.PUBLIC.USERS 
      SET RESET_TOKEN = ?, RESET_EXPIRES_AT = ? 
      WHERE EMAIL = ?
    `,
      [token, expiresAt.toISOString(), email]
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendEmail(
      email,
      "Reset your DataKindred password",
      `
    <div style="font-family: Arial, sans-serif; color: #1f2937; padding: 20px; background-color: #f9fafb;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px;">
        <img src="https://datakindred.com/kindred_purple48.png" alt="DataKindred Logo" style="height: 40px; margin-bottom: 20px;" />
        <h2 style="color: #111827;">Reset Your Password</h2>
        <p style="font-size: 16px; line-height: 1.5;">
          We received a request to reset your DataKindred password. Click the button below to continue:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Reset Password
          </a>
        </div>

        <p style="font-size: 14px; color: #6b7280;">
          This link will expire in 1 hour. If you didn’t request this, you can safely ignore this email.
        </p>

        <p style="font-size: 14px; color: #6b7280;">
          — The DataKindred Team
        </p>
      </div>
    </div>
  `
    );

    await logAuditEvent({
      accountId: null,
      initiatorEmail: email,
      initiatorAccountId: null,
      actorEmail: email,
      action: "reset_requested",
      targetEntity: user.id,
      status: "success",
      metadata: { ip },
    });

    res
      .status(200)
      .json({ message: "If an account exists, a reset link has been sent." });
  } catch (err) {
    return next(
      new HttpError("Could not process password reset request.", 500)
    );
  }
};

const requestAccess = async (req, res, next) => {
  let { name, email, company } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  email = email.toLowerCase().trim();

  if (!name || !email) {
    return next(new HttpError("Name and email are required.", 422));
  }

  try {
    const connection = await connectToSnowflake();
    await executeQuery(
      connection,
      `
      INSERT INTO KINDRED.PUBLIC.REQUESTED_USERS (NAME, EMAIL, COMPANY, REQUESTED_AT)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP())
    `,
      [name, email, company || null]
    );

    await sendEmail(
      process.env.ADMIN_EMAIL,
      "New Access Request",
      `
      <p>A new user has requested access:</p>
      <ul>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Company:</strong> ${company || "N/A"}</li>
      </ul>
    `
    );

    await logAuditEvent({
      accountId: null,
      initiatorAccountId: null,
      initiatorEmail: email,
      actorEmail: email,
      action: "access.requested",
      targetEntity: email,
      status: "success",
      metadata: { ip, company },
    });

    res.status(200).json({ message: "Access request submitted successfully." });
  } catch (err) {
    return next(new HttpError("Could not submit access request.", 500));
  }
};

const updateUser = async (req, res, next) => {
  const { name, currentPassword, newPassword } = req.body;
  const userId = req.user?.id;
  const email = req.user?.email;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const connection = await connectToSnowflake();
    const userData = await executeQuery(
      connection,
      `SELECT PASSWORD_HASH FROM KINDRED.PUBLIC.USERS WHERE ID = ?`,
      [userId]
    );

    if (!userData.length) {
      return res.status(404).json({ message: "User not found." });
    }

    const updates = [];
    const params = [];

    // Update name
    if (name) {
      updates.push("NAME = ?");
      params.push(name);
    }

    // If changing password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password required." });
      }

      const isValid = await bcrypt.compare(
        currentPassword,
        userData[0].PASSWORD_HASH
      );
      if (!isValid) {
        return res
          .status(403)
          .json({ message: "Current password is incorrect." });
      }

      const hash = await bcrypt.hash(newPassword, 12);
      updates.push("PASSWORD_HASH = ?");
      params.push(hash);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    params.push(userId);

    await executeQuery(
      connection,
      `UPDATE KINDRED.PUBLIC.USERS SET ${updates.join(", ")} WHERE ID = ?`,
      params
    );

    await logAuditEvent({
      accountId: req.user.accountId,
      initiatorAccountId: req.user.accountId,
      initiatorEmail: email,
      actorEmail: email,
      action: "user.update",
      targetEntity: userId,
      status: "success",
      metadata: { ip },
    });

    res.status(200).json({ message: "User updated successfully." });
  } catch (err) {
    console.error("Update error:", err);
    await logAuditEvent({
      accountId: req.user.accountId,
      initiatorAccountId: req.user.accountId,
      initiatorEmail: email,
      actorEmail: email,
      action: "user.update",
      targetEntity: userId,
      status: "failure",
      metadata: { ip },
    });
    return next(new HttpError("Failed to update user.", 500));
  }
};

export {
  login,
  signup,
  createCheckoutSession,
  logout,
  checkAuth,
  setupPassword,
  resetPassword,
  requestPasswordReset,
  requestAccess,
  updateUser,
  upgradePlan,
};
