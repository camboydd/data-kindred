import express from "express";
import Stripe from "stripe";
import crypto from "crypto";
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import { sendSetupPasswordEmail } from "../util/email-utils.js";

const stripeRouter = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

stripeRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("⚠️  Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ✅ Handle checkout completion
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const metadata = session.metadata || {};

      console.log("📦 Received checkout.session.completed");
      console.log("📦 Metadata:", metadata);

      const { email, name, company, plan, stripeCustomerId } = metadata;
      const subscriptionId = session.subscription;

      if (!email || !name || !plan || !stripeCustomerId || !subscriptionId) {
        console.warn("⚠️ Missing one or more required metadata fields.");
        return res.status(400).send("Missing metadata");
      }

      try {
        const conn = await connectToSnowflake();

        // Check for existing user
        const existing = await executeQuery(
          conn,
          `SELECT ID FROM KINDRED.PUBLIC.USERS WHERE EMAIL = ?`,
          [email]
        );

        if (existing.length > 0) {
          console.log(
            `👤 User already exists for ${email}, skipping creation.`
          );
          return res.status(200).send("ok");
        }

        // Create user ID + password setup token
        const userId = crypto.randomUUID();
        const setupToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

        console.log("🆕 Creating user and storing password setup token...");

        // Create user in USERS table
        await executeQuery(
          conn,
          `
          INSERT INTO KINDRED.PUBLIC.USERS 
          (ID, EMAIL, NAME, COMPANY, STRIPE_CUSTOMER_ID, STRIPE_SUBSCRIPTION_ID, PLAN)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          [userId, email, name, company, stripeCustomerId, subscriptionId, plan]
        );

        // Insert setup token
        await executeQuery(
          conn,
          `
          INSERT INTO KINDRED.PUBLIC.SETUP_PASSWORD_TOKENS (EMAIL, TOKEN, EXPIRES_AT, USED)
          VALUES (?, ?, ?, FALSE)
        `,
          [email, setupToken, expiresAt.toISOString()]
        );

        console.log(`🔐 Setup token stored. Sending email to ${email}...`);

        // Send email
        await sendSetupPasswordEmail(email, setupToken);

        console.log(`✅ User created and email sent to ${email}`);
        return res.status(200).send("ok");
      } catch (err) {
        console.error("❌ Failed during user creation or email step:", err);
        return res.status(500).send("User creation failed.");
      }
    }

    // ✅ Plan update
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const accountId =
        subscription.metadata?.accountId || subscription.metadata?.account_id;
      const priceId =
        subscription.items?.data?.[0]?.price?.id || subscription.plan?.id;

      let plan = null;
      if (priceId === process.env.BASIC_PRICE_ID) plan = "Basic";
      else if (priceId === process.env.PRO_PRICE_ID) plan = "Pro";
      else if (priceId === process.env.ENTERPRISE_PRICE_ID) plan = "Enterprise";

      if (!accountId || !plan) {
        console.warn("⚠️ Missing accountId or plan in subscription update");
        return res.status(200).send("ok");
      }

      try {
        const conn = await connectToSnowflake();
        await executeQuery(
          conn,
          `
          UPDATE KINDRED.PUBLIC.ACCOUNTS
          SET PLAN = ?, PLAN_SOURCE = 'stripe', STRIPE_SUBSCRIPTION_ID = ?
          WHERE ID = ?
        `,
          [plan, subscription.id, accountId]
        );

        console.log(`🔄 Updated account ${accountId} to plan "${plan}"`);
      } catch (err) {
        console.error("❌ Failed to update account plan:", err);
      }

      return res.status(200).send("ok");
    }

    // ✅ Subscription canceled
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const accountId =
        subscription.metadata?.accountId || subscription.metadata?.account_id;

      if (!accountId) return res.status(200).send("ok");

      try {
        const conn = await connectToSnowflake();
        await executeQuery(
          conn,
          `
          UPDATE KINDRED.PUBLIC.ACCOUNTS
          SET PLAN = 'Canceled', PLAN_SOURCE = 'stripe', STRIPE_SUBSCRIPTION_ID = NULL
          WHERE ID = ?
        `,
          [accountId]
        );

        console.log(`⚠️ Marked account ${accountId} as 'Canceled'`);
      } catch (err) {
        console.error("❌ Failed to mark account canceled:", err.message);
      }

      return res.status(200).send("ok");
    }

    // 🟡 Other event types
    return res.status(200).send("ok");
  }
);

export default stripeRouter;
