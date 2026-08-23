import { render, screen } from '@testing-library/react';
import ServerCard from '@/components/ServerCard';
import { BotServer } from '@/lib/api';

const baseServer: BotServer = {
  id: 'srv-1',
  name: 'My Discord Bot',
  description: 'A test bot',
  status: 'RUNNING',
  runtime: 'NODEJS',
  suspended: false,
  autoRestart: true,
  memoryLimitMb: 512,
  cpuLimitPercent: 100,
} as BotServer;

describe('ServerCard', () => {
  it('renders the server name, runtime, and resource limits', () => {
    render(<ServerCard server={baseServer} />);
    expect(screen.getByText('My Discord Bot')).toBeInTheDocument();
    expect(screen.getByText('node.js')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('512MB')).toBeInTheDocument();
  });

  it('links to the server detail page', () => {
    render(<ServerCard server={baseServer} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/servers/srv-1');
  });

  it('shows "python" for a Python runtime server', () => {
    render(<ServerCard server={{ ...baseServer, runtime: 'PYTHON' }} />);
    expect(screen.getByText('python')).toBeInTheDocument();
  });

  it('omits the description paragraph when none is set', () => {
    render(<ServerCard server={{ ...baseServer, description: undefined }} />);
    expect(screen.queryByText('A test bot')).not.toBeInTheDocument();
  });
});
