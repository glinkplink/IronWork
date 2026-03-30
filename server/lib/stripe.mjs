import Stripe from 'stripe';

let stripeSingleton = null;

function env(name) {
  const value = process.env[name];
  return value != null && String(value).trim() !== '' ? String(value).trim() : '';
}

export function resetStripeSingleton() {
  stripeSingleton = null;
}

function getStripe() {
  if (stripeSingleton) return stripeSingleton;
  const secretKey = env('STRIPE_SECRET_KEY');
  if (!secretKey) return null;
  stripeSingleton = new Stripe(secretKey);
  return stripeSingleton;
}

export async function createConnectedAccount(email) {
  const stripe = getStripe();
  if (!stripe) {
    return { data: null, error: 'Stripe not configured' };
  }

  try {
    const account = await stripe.accounts.create({
      type: 'express',
      ...(email ? { email } : {}),
    });
    return {
      data: {
        id: account.id,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Could not create Stripe account.',
    };
  }
}

export async function createAccountOnboardingLink(accountId, returnUrl, refreshUrl) {
  const stripe = getStripe();
  if (!stripe) {
    return { data: null, error: 'Stripe not configured' };
  }

  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return {
      data: {
        url: link.url,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Could not create onboarding link.',
    };
  }
}

export async function createInvoicePaymentLink(input) {
  const stripe = getStripe();
  if (!stripe) {
    return { data: null, error: 'Stripe not configured' };
  }

  try {
    const link = await stripe.paymentLinks.create(
      {
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: input.title,
                description: input.description,
              },
              unit_amount: input.totalCents,
            },
            quantity: 1,
          },
        ],
        payment_method_types: ['card', 'us_bank_account'],
        metadata: {
          invoice_id: input.invoiceId,
          job_id: input.jobId,
          user_id: input.userId,
        },
      },
      {
        stripeAccount: input.stripeAccountId,
      }
    );

    return {
      data: {
        id: link.id,
        url: link.url,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Could not create payment link.',
    };
  }
}

export function constructWebhookEvent(payload, signature, secret) {
  const stripe = getStripe();
  if (!stripe) {
    return { data: null, error: 'Stripe not configured' };
  }
  if (!secret) {
    return { data: null, error: 'Stripe webhook secret is not configured' };
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return { data: event, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Could not verify Stripe webhook.',
    };
  }
}
