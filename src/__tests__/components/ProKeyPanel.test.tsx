import { render, screen } from '@testing-library/react';
import { ProKeyPanel } from '../../components/ProKeyPanel';
import type { LicenseInfo } from '../../types';

const freeLicense: LicenseInfo = {
  activated: false,
  valid: false,
  tier: 'free',
  key: '',
  maxTargets: 3,
  issuedAt: null,
  expiresAt: null,
};

describe('ProKeyPanel', () => {
  it('explains the free 3-target tier and Lifetime Pro upgrade', async () => {
    Object.defineProperty(window, 'vaultstudio', {
      configurable: true,
      value: {
        license: {
          getInfo: vi.fn().mockResolvedValue(freeLicense),
          activate: vi.fn(),
          buyPro: vi.fn(),
          deactivate: vi.fn(),
        },
      },
    });

    render(<ProKeyPanel />);

    expect(await screen.findByText('Free Tier')).toBeInTheDocument();
    expect(screen.getByText(/Free includes 3 stream targets/i)).toBeInTheDocument();
    expect(screen.getByText(/3 dashboard platforms/i)).toBeInTheDocument();
    expect(screen.getByText(/Lifetime Pro is a one-time purchase/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Get Lifetime Pro/i })).toBeInTheDocument();
  });
});
