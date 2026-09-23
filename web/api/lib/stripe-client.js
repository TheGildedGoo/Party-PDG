import Stripe from "stripe";
import { httpError } from "./http.js";

const INTEGRATION_ID = "pdg-play-sub-hkwmnpqx";
let client = null;

export function integrationIdentifier() {
  return INTEGRATION_ID;
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw httpError(503, "STRIPE_SECRET_KEY is not set.");
  if (!client) client = new Stripe(key);
  return client;
}

export function priceId() {
  if (!process.env.STRIPE_PRICE_ID) throw httpError(503, "STRIPE_PRICE_ID is not set.");
  return process.env.STRIPE_PRICE_ID;
}
