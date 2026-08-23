import { render, screen } from '@testing-library/react';
import StatusPill from '@/components/StatusPill';

describe('StatusPill', () => {
  it('renders the status label', () => {
    render(<StatusPill status="RUNNING" />);
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
  });

  it('applies the pulsing-dot class only when RUNNING', () => {
    const { container, rerender } = render(<StatusPill status="RUNNING" />);
    expect(container.querySelector('.status-dot-running')).not.toBeNull();

    rerender(<StatusPill status="OFFLINE" />);
    expect(container.querySelector('.status-dot-running')).toBeNull();
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();
  });

  it.each(['INSTALLING', 'STOPPING', 'SUSPENDED', 'ERRORED'] as const)(
    'renders %s without throwing',
    (status) => {
      render(<StatusPill status={status} />);
      expect(screen.getByText(status)).toBeInTheDocument();
    },
  );
});
