// util/stripe.js
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function createStripeCustomer({ name, email, accountId }) {
  const customer = await stripe.customers.create({
    name,
    email,
    metadata: { accountId },
  });

  return customer.id;
}
