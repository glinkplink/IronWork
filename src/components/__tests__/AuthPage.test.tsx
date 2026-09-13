// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthPage } from '../AuthPage';
import { signIn } from '../../lib/auth';

vi.mock('../../lib/auth', () => ({
  signIn: vi.fn().mockResolvedValue({ error: null }),
}));

afterEach(() => {
  cleanup();
});

describe('AuthPage', () => {
  it('associates email and password inputs with visible labels', () => {
    render(<AuthPage />);

    expect(screen.getByLabelText(/^Email$/i)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/^Password$/i)).toHaveAttribute('type', 'password');
  });

  it('rewrites Failed to fetch into a connection message', async () => {
    vi.mocked(signIn).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Failed to fetch' },
    } as never);
    const user = userEvent.setup();
    render(<AuthPage />);
    await user.type(screen.getByLabelText(/^Email$/i), 'testermvp@example.com');
    await user.type(screen.getByLabelText(/^Password$/i), 'badpassword1');
    await user.click(screen.getByRole('button', { name: /Sign In/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not reach IronWork. Check your connection and try again.'
    );
  });
});
