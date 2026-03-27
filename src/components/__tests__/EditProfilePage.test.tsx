// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditProfilePage } from '../EditProfilePage';
import type { BusinessProfile } from '../../types/db';

const upsertProfile = vi.fn();

vi.mock('../../lib/db/profile', () => ({
  upsertProfile: (...args: unknown[]) => upsertProfile(...args),
}));

vi.mock('../../lib/auth', () => ({
  signOut: vi.fn(),
}));

function profileFixture(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    id: 'p1',
    user_id: 'u1',
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
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('EditProfilePage payment validation', () => {
  beforeEach(() => {
    upsertProfile.mockReset();
  });

  it('shows error banner and does not call upsert when payment terms days are invalid', async () => {
    const user = userEvent.setup();
    upsertProfile.mockResolvedValue({ data: null, error: null });
    render(
      <EditProfilePage
        profile={profileFixture()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByLabelText(/Payment Terms/i), 'custom');
    const daysInput = screen.getByLabelText(/^Days$/i);
    await user.clear(daysInput);
    await user.type(daysInput, '0');

    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    expect(upsertProfile).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByText(/Payment terms must be between 1 and 365 days/i)
      ).toBeInTheDocument();
    });
  });

  it('calls upsert when payment settings are valid', async () => {
    upsertProfile.mockResolvedValue({
      data: profileFixture(),
      error: null,
    });
    render(
      <EditProfilePage
        profile={profileFixture()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(upsertProfile).toHaveBeenCalledTimes(1);
    });
  });
});
