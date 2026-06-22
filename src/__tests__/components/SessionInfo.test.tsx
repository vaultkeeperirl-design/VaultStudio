import { render, screen } from '@testing-library/react';
import { SessionInfo } from '../../components/studio/SessionInfo';
import { mockStats, mockOutputStats } from '../../mocks/mockData';

describe('SessionInfo', () => {
  it('renders total viewer count', () => {
    render(<SessionInfo stats={mockStats} outputStats={mockOutputStats} />);
    expect(screen.getByText('37')).toBeInTheDocument();
  });

  it('renders per-platform breakdown', () => {
    render(<SessionInfo stats={mockStats} outputStats={mockOutputStats} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('renders stream duration', () => {
    render(<SessionInfo stats={mockStats} outputStats={mockOutputStats} />);
    expect(screen.getByText('00:13:48')).toBeInTheDocument();
  });
});
