import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SplashScreen } from '../../components/SplashScreen';

describe('SplashScreen', () => {
  it('should render the VaultStudio logo', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    const logo = screen.getByAltText('VaultStudio');
    expect(logo).toBeInTheDocument();
  });

  it('should display the version number', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    expect(screen.getByText('VaultStudio v0.1.0')).toBeInTheDocument();
  });

  it('should display the status message', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    expect(screen.getByText('Starting engine...')).toBeInTheDocument();
  });

  it('should render 5 LED indicators', () => {
    render(<SplashScreen version="0.1.0" status="Starting engine..." />);
    const leds = screen.getAllByRole('img', { name: /led/i });
    expect(leds).toHaveLength(5);
  });
});
