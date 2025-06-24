import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import HttpError from "../models/http-error.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { sendEmail } from "../util/send-email.js"; // replace with your actual utility
import { logAuditEvent } from "../util/auditLogger.js";

const getAccounts = async (req, res, next) => {
  try {
    const connection = await connectToSnowflake();
    const result = await executeQuery(
      connection,
      `SELECT ID, NAME, PLAN, CREATED_AT FROM KINDRED.PUBLIC.ACCOUNTS`
    );

    const accounts = result.map((row) => ({
      id: row.ID,
      name: row.NAME,
      plan: row.PLAN,
      created_at: row.CREATED_AT,
    }));

    res.status(200).json(accounts);
  } catch (err) {
    console.error("❌ Error fetching accounts:", err);
    return next(new HttpError("Fetching accounts failed.", 500));
  }
};

// Get all users
const getUsers = async (req, res, next) => {
  try {
    const connection = await connectToSnowflake();
    const result = await executeQuery(
      connection,
      `SELECT ID, NAME, EMAIL, ROLE, ACCOUNT_ID, CREATED_AT FROM KINDRED.PUBLIC.USERS`
    );

    const users = result.map((row) => ({
      id: row.ID,
      name: row.NAME,
      email: row.EMAIL,
      role: row.ROLE,
      account_id: row.ACCOUNT_ID,
      created_at: row.CREATED_AT,
    }));

    res.status(200).json(users);
  } catch (err) {
    console.error("❌ Error fetching users:", err);
    return next(new HttpError("Fetching users failed.", 500));
  }
};
// Add a new account
const createAccount = async (req, res, next) => {
  const { name, plan } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!name) {
    return next(new HttpError("Account name is required.", 422));
  }

  const id = uuidv4();

  try {
    const connection = await connectToSnowflake();
    await executeQuery(
      connection,
      `INSERT INTO KINDRED.PUBLIC.ACCOUNTS (ID, NAME, PLAN) VALUES (?, ?, ?)`,
      [id, name, plan || "Free"]
    );

    await logAuditEvent({
      accountId: id, // the account just created
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "created_account",
      targetEntity: id,
      status: "success",
      metadata: {
        name,
        plan: plan || "Free",
        ip,
      },
    });

    res.status(201).json({ message: "Account created successfully.", id });
  } catch (err) {
    console.error("❌ Error creating account:", err);
    await logAuditEvent({
      accountId: id, // the account just created
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "created_account",
      targetEntity: id,
      status: "fail",
      metadata: {
        name,
        plan: plan || "Free",
        ip,
        error: err.message,
      },
    });
    return next(new HttpError("Creating account failed.", 500));
  }
};

// Add a new user to an account
const createUser = async (req, res, next) => {
  const { name, email, role, account_id } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!email || !account_id) {
    return next(new HttpError("Email and account ID are required.", 422));
  }

  const id = uuidv4();
  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

  try {
    const connection = await connectToSnowflake();

    await executeQuery(
      connection,
      `INSERT INTO KINDRED.PUBLIC.USERS (ID, ACCOUNT_ID, EMAIL, NAME, ROLE, RESET_TOKEN, RESET_EXPIRES_AT) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        account_id,
        email,
        name || null,
        role || "member",
        resetToken,
        expiresAt,
      ]
    );

    const setupLink = `${process.env.FRONTEND_URL}/setup-password?token=${resetToken}`;
    const htmlContent = `
  <div style="font-family: Arial, sans-serif; color: #1f2937; padding: 20px; background-color: #f9fafb;">
    <div style="max-width: 600px; margin: auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 30px;">
      <img src="https://datakindred.com/kindred_purple48.png" alt="DataKindred Logo" style="height: 40px; margin-bottom: 20px;" />

      <h2 style="color: #111827;">Welcome to DataKindred</h2>
      <p style="font-size: 16px; line-height: 1.5;">
        You’ve been invited to set up your DataKindred account. Click the button below to create your password and get started:
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${setupLink}" style="display: inline-block; padding: 12px 24px; background-color: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Create Your Account
        </a>
      </div>

      <p style="font-size: 14px; color: #6b7280;">
        This link will expire in 24 hours. If you didn’t expect this invitation, you can safely ignore this email.
      </p>

      <p style="font-size: 14px; color: #6b7280;">
        — The DataKindred Team
      </p>
    </div>
  </div>
`;
    await sendEmail(email, "Set up your DataKindred account", htmlContent);

    await logAuditEvent({
      accountId: account_id, // the target account for the user
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "created_user",
      targetEntity: id,
      status: "success",
      metadata: {
        account_id,
        email,
        role: role || "member",
        ip,
      },
    });

    res.status(201).json({ message: "User created and setup email sent.", id });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    await logAuditEvent({
      accountId: account_id, // the target account for the user
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "created_user",
      targetEntity: id,
      status: "fail",
      metadata: {
        account_id,
        email,
        role: role || "member",
        ip,
        error: err.message,
      },
    });
    return next(new HttpError("Creating user failed.", 500));
  }
};
const deleteAccount = async (req, res, next) => {
  const { accountId } = req.params;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!accountId) {
    return next(new HttpError("Account ID is required.", 422));
  }

  try {
    const connection = await connectToSnowflake();

    // Fetch account metadata before deletion
    const accountResult = await executeQuery(
      connection,
      `SELECT NAME FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );
    const accountName = accountResult?.[0]?.NAME || "Unknown";

    // Delete associated users
    await executeQuery(
      connection,
      `DELETE FROM KINDRED.PUBLIC.USERS WHERE ACCOUNT_ID = ?`,
      [accountId]
    );

    // Delete the account
    await executeQuery(
      connection,
      `DELETE FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );

    await logAuditEvent({
      accountId: accountId, // account being deleted
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "deleted_account",
      targetEntity: accountId,
      status: "success",
      metadata: {
        name: accountName,
        ip,
      },
    });

    res.status(200).json({
      message: `Account ${accountId} (${accountName}) and associated users deleted.`,
    });
  } catch (err) {
    console.error("❌ Error deleting account:", err);

    await logAuditEvent({
      accountId: accountId, // account being deleted
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "deleted_account",
      targetEntity: accountId,
      status: "fail",
      metadata: {
        ip,
        error: err.message,
      },
    });

    return next(new HttpError("Deleting account failed.", 500));
  }
};
const deleteUser = async (req, res, next) => {
  const { userId } = req.params;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!userId) {
    return next(new HttpError("User ID is required.", 422));
  }

  try {
    const connection = await connectToSnowflake();

    // Fetch user metadata before deletion
    const userResult = await executeQuery(
      connection,
      `SELECT NAME, EMAIL, ACCOUNT_ID FROM KINDRED.PUBLIC.USERS WHERE ID = ?`,
      [userId]
    );
    const userName = userResult?.[0]?.NAME || null;
    const userEmail = userResult?.[0]?.EMAIL || "Unknown";
    const affectedAccountId =
      userResult?.[0]?.ACCOUNT_ID || req.user?.accountId;

    await executeQuery(
      connection,
      `DELETE FROM KINDRED.PUBLIC.USERS WHERE ID = ?`,
      [userId]
    );

    await logAuditEvent({
      accountId: affectedAccountId,
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "deleted_user",
      targetEntity: userId,
      status: "success",
      metadata: {
        name: userName,
        email: userEmail,
        ip,
      },
    });

    res.status(200).json({ message: `User ${userId} (${userEmail}) deleted.` });
  } catch (err) {
    console.error("❌ Error deleting user:", err);

    await logAuditEvent({
      accountId: affectedAccountId,
      actorEmail: req.user?.email || "system",
      initiatorAccountId: req.user?.accountId,
      initiatorEmail: req.user?.email,
      action: "deleted_user",
      targetEntity: userId,
      status: "fail",
      metadata: {
        ip,
        error: err.message,
      },
    });

    return next(new HttpError("Deleting user failed.", 500));
  }
};

export {
  getAccounts,
  getUsers,
  createAccount,
  createUser,
  deleteAccount,
  deleteUser,
};
