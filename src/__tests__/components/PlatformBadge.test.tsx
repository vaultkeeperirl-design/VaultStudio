import { render, screen } from '@testing-library/react';
import { PlatformBadge } from '../../components/common/PlatformBadge';

describe('PlatformBadge', () => {
  it('renders Twitch badge with correct label', () => {
    render(<PlatformBadge platform="twitch" />);
    expect(screen.getByText('Twitch')).toBeInTheDocument();
  });

  it('renders Kick badge with correct label', () => {
    render(<PlatformBadge platform="kick" />);
    expect(screen.getByText('Kick')).toBeInTheDocument();
  });

  it('renders TikTok badge with correct label', () => {
    render(<PlatformBadge platform="tiktok" />);
    expect(screen.getByText('TikTok')).toBeInTheDocument();
  });
});
