import Stripe from "stripe";
import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import HttpError from "../models/http-error.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/account/portal
export const openBillingPortal = async (req, res, next) => {
  const { accountId } = req.user;

  try {
    const conn = await connectToSnowflake();
    const result = await executeQuery(
      conn,
      `SELECT STRIPE_CUSTOMER_ID FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );

    const stripeCustomerId = result?.[0]?.STRIPE_CUSTOMER_ID;
    if (!stripeCustomerId) {
      return next(new HttpError("Stripe customer not found.", 404));
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings`,
    });

    res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error("❌ Failed to open billing portal:", err);
    return next(new HttpError("Could not open billing portal", 500));
  }
};

// GET /api/account/invoices
export const getInvoices = async (req, res, next) => {
  const { accountId } = req.user;

  try {
    const conn = await connectToSnowflake();
    const result = await executeQuery(
      conn,
      `SELECT STRIPE_CUSTOMER_ID FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );

    const stripeCustomerId = result?.[0]?.STRIPE_CUSTOMER_ID;
    if (!stripeCustomerId) {
      return next(new HttpError("Stripe customer not found.", 404));
    }

    const invoices = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 10,
    });

    res.status(200).json({ invoices: invoices.data });
  } catch (err) {
    console.error("❌ Failed to get invoices:", err);
    return next(new HttpError("Failed to retrieve invoices.", 500));
  }
};

// POST /api/account/cancel-subscription
export const cancelSubscription = async (req, res, next) => {
  const { accountId } = req.user;

  try {
    const conn = await connectToSnowflake();
    const result = await executeQuery(
      conn,
      `SELECT STRIPE_SUBSCRIPTION_ID FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );

    const subscriptionId = result?.[0]?.STRIPE_SUBSCRIPTION_ID;
    if (!subscriptionId) {
      return next(new HttpError("No active subscription found.", 404));
    }

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    res
      .status(200)
      .json({ message: "Subscription will cancel at period end." });
  } catch (err) {
    console.error("❌ Failed to cancel subscription:", err);
    return next(new HttpError("Failed to cancel subscription", 500));
  }
};

// POST /api/account/upgrade
export const upgradePlan = async (req, res, next) => {
  const { accountId, email, plan } = req.user;
  const { priceId } = req.body;

  if (!priceId || !accountId) {
    return next(new HttpError("Missing priceId or accountId.", 400));
  }

  try {
    const conn = await connectToSnowflake();
    const result = await executeQuery(
      conn,
      `SELECT STRIPE_CUSTOMER_ID FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
      [accountId]
    );

    const stripeCustomerId = result?.[0]?.STRIPE_CUSTOMER_ID;
    if (!stripeCustomerId) {
      return next(new HttpError("Stripe customer not found for account.", 404));
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        accountId,
        upgradedFrom: plan || "unknown",
      },
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=success`,
      cancel_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=cancel`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("❌ Error starting upgrade session:", err);
    return next(new HttpError("Upgrade failed. Try again later.", 500));
  }
};
