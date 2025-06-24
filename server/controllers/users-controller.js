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

const verifyCaptcha = async (token) => {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  const response = await axios.post(
    `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`
  );
  return response.data.success;
};

const login = async (req, res, next) => {
  let { email, password } = req.body;

  if (!email || !password) {
    return res.status(422).json({
      success: false,
      message: "Email and password are required.",
      code: "MISSING_CREDENTIALS",
    });
  }

  email = email.toLowerCase().trim();
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  try {
    const user = await getUserByEmail(email);

    if (!user) {
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

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
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

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        accountId: user.account_id,
        role: user.role,
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
      accountId: user.account_id,
      initiatorAccountId: user.account_id,
      initiatorEmail: user.email,
      actorEmail: user.email,
      action: "login",
      targetEntity: user.id,
      status: "success",
      metadata: { ip },
    });

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        email: user.email,
        role: user.role,
        account_id: user.account_id,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
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

const checkAuth = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      email: decoded.email,
      id: decoded.userId,
      role: decoded.role, // ✅ add this
      accountId: decoded.accountId, // ✅ and this
    };

    next();
  } catch (err) {
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
  logout,
  checkAuth,
  setupPassword,
  resetPassword,
  requestPasswordReset,
  requestAccess,
  updateUser,
};
