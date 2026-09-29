// Stripe keys are server-side only, never a NEXT_PUBLIC name. Test-mode
// values live in .env.local; the preview environment carries its own in
// Vercel. Copy .env.example to .env.local.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const stripeEnv = {
  get secretKey(): string {
    return required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
  },
  get webhookSecret(): string {
    return required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
  },
  get priceId(): string {
    return required("STRIPE_PRICE_ID", process.env.STRIPE_PRICE_ID);
  },
};
