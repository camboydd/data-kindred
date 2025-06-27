import express from "express";
import Stripe from "stripe";
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Ensure raw body is used for Stripe signature verification
router.post(
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

    // Handle relevant subscription events
    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.updated"
    ) {
      const data = event.data.object;

      const accountId =
        data.metadata?.accountId || data.metadata?.account_id || null;

      const subscription = data.subscription
        ? await stripe.subscriptions.retrieve(data.subscription)
        : data;

      const priceId =
        subscription.items?.data?.[0]?.price?.id ||
        subscription.plan?.id ||
        null;

      if (!accountId || !priceId) {
        console.warn("⚠️  Missing accountId or priceId in event");
        return res.status(200).send("ok");
      }

      let plan = null;
      if (priceId === process.env.BASIC_PRICE_ID) plan = "Basic";
      else if (priceId === process.env.PRO_PRICE_ID) plan = "Pro";
      else if (priceId === process.env.ENTERPRISE_PRICE_ID) plan = "Enterprise";

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

        console.log(`✅ Updated account ${accountId} to plan "${plan}"`);
      } catch (err) {
        console.error("❌ Failed to update Snowflake account:", err.message);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const accountId = subscription.metadata?.accountId;

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

        console.log(
          `⚠️ Subscription cancelled. Marked account ${accountId} as 'Canceled'`
        );
      } catch (err) {
        console.error("❌ Failed to mark account as canceled:", err.message);
      }

      return res.status(200).send("ok");
    }

    res.status(200).send("ok");
  }
);

export default router;
