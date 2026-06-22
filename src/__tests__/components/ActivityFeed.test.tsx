import { render, screen } from '@testing-library/react';
import { ActivityFeed } from '../../components/studio/ActivityFeed';
import { mockActivityEvents } from '../../mocks/mockData';

describe('ActivityFeed', () => {
  it('renders activity events with platform badges', () => {
    render(<ActivityFeed events={mockActivityEvents} />);
    expect(screen.getAllByText('mysticlloyd').length).toBeGreaterThan(0);
    expect(screen.getByText('reached 3-stream streak')).toBeInTheDocument();
    expect(screen.getAllByTitle('Twitch').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Kick').length).toBeGreaterThan(0);
  });
});
