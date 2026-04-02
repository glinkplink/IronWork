// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePage } from '../HomePage';

describe('HomePage', () => {
  it('renders headline, subheading, and CTA without the old tagline', () => {
    render(<HomePage onCreateAgreement={vi.fn()} />);

    expect(screen.getByText(/Stop working for free/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cover your ass.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Work Order' })).toBeInTheDocument();
    expect(screen.queryByText(/Work orders that keep your backend clean/i)).not.toBeInTheDocument();
  });
});
