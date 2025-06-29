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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const metadata = session.metadata || {};

      console.log("📦 Received checkout.session.completed");
      console.log("📦 Metadata:", metadata);

      const { email, name, company, plan, stripeCustomerId } = metadata;
      const subscriptionId = session.subscription;

      if (
        !email ||
        !name ||
        !company ||
        !plan ||
        !stripeCustomerId ||
        !subscriptionId
      ) {
        console.warn("⚠️ Missing one or more required metadata fields.");
        return res.status(400).send("Missing metadata");
      }

      try {
        const conn = await connectToSnowflake();

        // 👀 Check if user already exists
        const existingUser = await executeQuery(
          conn,
          `SELECT ID FROM KINDRED.PUBLIC.USERS WHERE EMAIL = ?`,
          [email]
        );

        if (existingUser.length > 0) {
          console.log(`👤 User already exists for ${email}.`);

          // Check for existing setup token
          const existingToken = await executeQuery(
            conn,
            `
            SELECT TOKEN FROM KINDRED.PUBLIC.SETUP_PASSWORD_TOKENS
            WHERE EMAIL = ? AND USED = FALSE AND EXPIRES_AT > CURRENT_TIMESTAMP()
            `,
            [email]
          );

          if (existingToken.length > 0) {
            console.log(
              `🔁 Token already exists for ${email}, skipping resend.`
            );
            return res.status(200).send("ok");
          }

          console.log("🆕 No setup token found. Creating one now...");
          const setupToken = crypto.randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

          // Insert setup token
          await executeQuery(
            conn,
            `
            INSERT INTO KINDRED.PUBLIC.SETUP_PASSWORD_TOKENS 
            (EMAIL, TOKEN, EXPIRES_AT, USED)
            VALUES (?, ?, ?, FALSE)
            `,
            [email, setupToken, expiresAt.toISOString()]
          );

          console.log(`📧 Sending setup email to ${email}...`);
          await sendSetupPasswordEmail(email, setupToken);

          console.log(`✅ Token created and email sent to ${email}`);
          return res.status(200).send("ok");
        }

        // 👤 Create account
        const accountId = crypto.randomUUID();
        await executeQuery(
          conn,
          `
          INSERT INTO KINDRED.PUBLIC.ACCOUNTS 
          (ID, NAME, PLAN, STRIPE_CUSTOMER_ID, STRIPE_SUBSCRIPTION_ID)
          VALUES (?, ?, ?, ?, ?)
        `,
          [accountId, company, plan, stripeCustomerId, subscriptionId]
        );

        // 👤 Create user tied to the account
        const userId = crypto.randomUUID();
        const setupToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

        await executeQuery(
          conn,
          `
          INSERT INTO KINDRED.PUBLIC.USERS 
          (ID, ACCOUNT_ID, EMAIL, NAME)
          VALUES (?, ?, ?, ?)
        `,
          [userId, accountId, email, name]
        );

        // 🪪 Store password setup token
        await executeQuery(
          conn,
          `
          INSERT INTO KINDRED.PUBLIC.SETUP_PASSWORD_TOKENS 
          (EMAIL, TOKEN, EXPIRES_AT, USED)
          VALUES (?, ?, ?, FALSE)
        `,
          [email, setupToken, expiresAt.toISOString()]
        );

        console.log(`🔐 Setup token stored. Sending email to ${email}...`);

        await sendSetupPasswordEmail(email, setupToken);

        console.log(`✅ Account and user created. Email sent to ${email}`);
        return res.status(200).send("ok");
      } catch (err) {
        console.error("❌ Failed during account/user creation:", err);
        return res.status(500).send("User creation failed.");
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer;
      const priceId =
        subscription.items?.data?.[0]?.price?.id || subscription.plan?.id;

      let plan = null;
      if (priceId === process.env.BASIC_PRICE_ID) plan = "Basic";
      else if (priceId === process.env.PRO_PRICE_ID) plan = "Pro";
      else if (priceId === process.env.ENTERPRISE_PRICE_ID) plan = "Enterprise";

      if (!stripeCustomerId || !plan) {
        console.warn("⚠️ Missing stripeCustomerId or unmatched plan ID");
        return res.status(200).send("ok");
      }

      try {
        const conn = await connectToSnowflake();

        await executeQuery(
          conn,
          `
      UPDATE KINDRED.PUBLIC.ACCOUNTS
      SET PLAN = ?, PLAN_SOURCE = 'stripe', STRIPE_SUBSCRIPTION_ID = ?
      WHERE STRIPE_CUSTOMER_ID = ?
    `,
          [plan, subscription.id, stripeCustomerId]
        );

        console.log(
          `🔄 Updated account with STRIPE_CUSTOMER_ID ${stripeCustomerId} to plan "${plan}"`
        );
      } catch (err) {
        console.error("❌ Failed to update account plan:", err);
      }

      return res.status(200).send("ok");
    }

    // ✅ Subscription canceled
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const stripeCustomerId = subscription.customer;

      if (!stripeCustomerId) {
        console.warn(
          "⚠️ Missing stripeCustomerId in subscription.deleted event"
        );
        return res.status(200).send("ok");
      }

      try {
        const conn = await connectToSnowflake();

        await executeQuery(
          conn,
          `
      UPDATE KINDRED.PUBLIC.ACCOUNTS
      SET PLAN = 'Canceled', PLAN_SOURCE = 'stripe', STRIPE_SUBSCRIPTION_ID = NULL
      WHERE STRIPE_CUSTOMER_ID = ?
    `,
          [stripeCustomerId]
        );

        console.log(
          `⚠️ Marked account with STRIPE_CUSTOMER_ID ${stripeCustomerId} as 'Canceled'`
        );
      } catch (err) {
        console.error("❌ Failed to mark account as canceled:", err.message);
      }

      return res.status(200).send("ok");
    }

    // 🟡 Other event types
    return res.status(200).send("ok");
  }
);

export default stripeRouter;
