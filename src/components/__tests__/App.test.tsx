// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BusinessProfile } from '../../types/db';
import App from '../../App';

const profile: BusinessProfile = {
  id: 'p1',
  user_id: 'u1',
  business_name: 'Forge LLC',
  owner_name: 'Alex Smith',
  phone: null,
  email: 'alex@example.com',
  address: null,
  google_business_profile_url: null,
  default_exclusions: [],
  default_assumptions: [],
  next_wo_number: 1,
  next_invoice_number: 1,
  default_warranty_period: 0,
  default_negotiation_period: 0,
  default_payment_methods: [],
  default_tax_rate: 0,
  default_late_payment_terms: '',
  default_payment_terms_days: 0,
  default_late_fee_rate: 0,
  default_card_fee_note: false,
  stripe_account_id: null,
  stripe_onboarding_complete: false,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

vi.mock('../../hooks/useAuthProfile', () => ({
  useAuthProfile: () => ({
    user: { id: 'u1' },
    authLoading: false,
    profile,
    profileLoading: false,
    setProfile: vi.fn(),
    loadProfile: vi.fn(),
    handleCaptureFlowFinished: vi.fn(),
    stripeConnectNotice: null,
  }),
}));

vi.mock('../../hooks/useWorkOrderDraft', () => ({
  useWorkOrderDraft: () => ({
    state: {
      job: {},
      currentJobId: null,
      woCounterPersistError: null,
      showUnsavedModal: false,
    },
    actions: {
      createNewAgreement: vi.fn(),
      setJob: vi.fn(),
      handleSaveSuccess: vi.fn(),
      dismissWoCounterError: vi.fn(),
      closeUnsavedModal: vi.fn(),
      continueEditingWorkOrder: vi.fn(),
      doCreateNewAgreement: vi.fn(),
    },
  }),
}));

vi.mock('../../hooks/useInvoiceFlow', () => ({
  useInvoiceFlow: () => ({
    state: {
      refreshKey: 0,
      invoiceFlowJob: null,
      activeInvoice: null,
      invoiceFlowChangeOrder: null,
      invoiceFlowTarget: 'job',
      wizardExistingInvoice: null,
    },
    actions: {
      handleStartInvoice: vi.fn(),
      handleOpenPendingInvoice: vi.fn(),
      handleStartChangeOrderInvoice: vi.fn(),
      handleOpenPendingChangeOrderInvoice: vi.fn(),
      handleInvoiceWizardCancel: vi.fn(),
      handleInvoiceWizardSuccess: vi.fn(),
      handleInvoiceFinalBack: vi.fn(),
      handleEditInvoice: vi.fn(),
      handleInvoiceUpdated: vi.fn(),
      resetInvoiceFlow: vi.fn(),
    },
  }),
}));

vi.mock('../../hooks/useChangeOrderFlow', () => ({
  useChangeOrderFlow: () => ({
    state: {
      coDetailBackTarget: 'work-order-detail',
      coDetailCO: null,
      changeOrderFlowJob: null,
      wizardExistingCO: null,
    },
    actions: {
      resetFlowForBackToList: vi.fn(),
      handleBackFromCODetail: vi.fn(),
      handleDeleteCOFromDetail: vi.fn(),
      handleStartChangeOrderFromDetail: vi.fn(),
      handleOpenCODetail: vi.fn(),
      handleChangeOrderWizardComplete: vi.fn(),
      handleChangeOrderWizardCancel: vi.fn(),
      handleCoEsignUpdated: vi.fn(),
      handleEditCOFromDetail: vi.fn(),
      resetChangeOrderFlow: vi.fn(),
    },
  }),
}));

vi.mock('../../components/HomePage', () => ({
  HomePage: () => <div>Home Screen</div>,
}));

vi.mock('../../components/AuthPage', () => ({
  AuthPage: () => <div>Auth Screen</div>,
}));

vi.mock('../../components/BusinessProfileForm', () => ({
  BusinessProfileForm: () => <div>Business Profile Form</div>,
}));

vi.mock('../../components/EditProfilePage', () => ({
  EditProfilePage: () => <div>Edit Profile Page</div>,
}));

vi.mock('../../components/JobForm', () => ({
  JobForm: () => <div>Job Form</div>,
}));

vi.mock('../../components/AgreementPreview', () => ({
  AgreementPreview: () => <div>Agreement Preview</div>,
}));

vi.mock('../../components/ClientsPage', () => ({
  ClientsPage: () => <div>Clients Screen</div>,
}));

describe('App bottom navigation', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('includes Clients and marks it active after navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    const clientsButton = screen.getByRole('button', { name: 'Clients' });
    expect(clientsButton).toBeInTheDocument();
    expect(clientsButton).not.toHaveClass('active');

    await user.click(clientsButton);

    await waitFor(() => {
      expect(screen.getByText('Clients Screen')).toBeInTheDocument();
    });
    expect(clientsButton).toHaveClass('active');
  });
});
