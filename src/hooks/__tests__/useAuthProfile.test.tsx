// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useAuthProfile } from '../useAuthProfile';

const useAuthMock = vi.fn();
const getProfileMock = vi.fn();
const getStripeConnectStatusMock = vi.fn();
const getSessionMock = vi.fn();

vi.mock('../useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../lib/db/profile', () => ({
  getProfile: (...args: unknown[]) => getProfileMock(...args),
}));

vi.mock('../../lib/stripe-connect', () => ({
  getStripeConnectStatus: (...args: unknown[]) => getStripeConnectStatusMock(...args),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSessionMock(...args),
    },
  },
}));

function profileFixture() {
  return {
    id: 'profile-1',
    user_id: 'user-1',
    business_name: 'Test Co',
    owner_name: null,
    phone: null,
    email: null,
    address: null,
    google_business_profile_url: null,
    default_exclusions: [],
    default_assumptions: [],
    next_wo_number: 1,
    next_invoice_number: 1,
    default_warranty_period: 30,
    default_negotiation_period: 10,
    default_payment_methods: [],
    default_tax_rate: 0,
    default_late_payment_terms: '',
    default_payment_terms_days: 14,
    default_late_fee_rate: 1.5,
    default_card_fee_note: false,
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    created_at: '',
    updated_at: '',
  };
}

function Harness(props: {
  replaceView: (next: import('../useAppNavigation').AppView) => void;
  setWorkOrdersSuccessBanner: (msg: string | null) => void;
}) {
  const { stripeConnectNotice } = useAuthProfile(props);
  return (
    <div data-testid="notice">
      {stripeConnectNotice ? `${stripeConnectNotice.tone}:${stripeConnectNotice.message}` : ''}
    </div>
  );
}

describe('useAuthProfile Stripe connect handling', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { id: 'user-1' },
      loading: false,
    });
    getProfileMock.mockReset();
    getStripeConnectStatusMock.mockReset();
    getSessionMock.mockReset();
    getProfileMock.mockResolvedValue(profileFixture());
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
        },
      },
    });
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('reconciles Stripe status on return and opens the profile view', async () => {
    const replaceView = vi.fn();
    getStripeConnectStatusMock.mockResolvedValue({
      accountId: 'acct_123',
      onboardingComplete: true,
      status: 'connected',
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
    window.history.replaceState({}, '', '/?stripe_connect=return');

    render(
      <Harness
        replaceView={replaceView}
        setWorkOrdersSuccessBanner={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getStripeConnectStatusMock).toHaveBeenCalledTimes(1);
      expect(replaceView).toHaveBeenCalledWith('profile');
      expect(screen.getByTestId('notice')).toHaveTextContent(
        /success:Stripe account connected/i
      );
    });
    expect(window.location.search).toBe('');
  });

  it('shows an info notice on refresh when onboarding is incomplete', async () => {
    const replaceView = vi.fn();
    getStripeConnectStatusMock.mockResolvedValue({
      accountId: 'acct_123',
      onboardingComplete: false,
      status: 'pending',
    });
    window.history.replaceState({}, '', '/?stripe_connect=refresh');

    render(
      <Harness
        replaceView={replaceView}
        setWorkOrdersSuccessBanner={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getStripeConnectStatusMock).toHaveBeenCalledTimes(1);
      expect(replaceView).toHaveBeenCalledWith('profile');
      expect(screen.getByTestId('notice')).toHaveTextContent(
        /info:Stripe setup is still incomplete/i
      );
    });
    expect(window.location.search).toBe('');
  });

  it('shows a success notice on refresh when onboarding is complete', async () => {
    const replaceView = vi.fn();
    getStripeConnectStatusMock.mockResolvedValue({
      accountId: 'acct_123',
      onboardingComplete: true,
      status: 'connected',
    });
    window.history.replaceState({}, '', '/?stripe_connect=refresh');

    render(
      <Harness
        replaceView={replaceView}
        setWorkOrdersSuccessBanner={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getStripeConnectStatusMock).toHaveBeenCalledTimes(1);
      expect(replaceView).toHaveBeenCalledWith('profile');
      expect(screen.getByTestId('notice')).toHaveTextContent(
        /success:Stripe account connected/i
      );
    });
    expect(window.location.search).toBe('');
  });
});
