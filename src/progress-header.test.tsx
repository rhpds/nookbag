import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProgressHeader from './progress-header';
import { TModule } from './types';

vi.mock('./utils', () => ({
  exitLab: vi.fn(),
  restartLab: vi.fn(),
}));

describe('ProgressHeader', () => {
  const modules: TModule[] = [
    { name: 'module-01', label: 'Introduction' },
    { name: 'module-02', label: 'Setup Database' },
    { name: 'module-03', label: 'Deploy App' },
  ];

  const defaultProgress = {
    current: 'module-02',
    inProgress: [],
    notStarted: ['module-03'],
    completed: ['module-01'],
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  function renderHeader(overrides: Partial<React.ComponentProps<typeof ProgressHeader>> = {}) {
    const setIframeModule = vi.fn();
    const result = render(
      <ProgressHeader
        sessionUuid={overrides.sessionUuid ?? 'test-uuid'}
        modules={overrides.modules ?? modules}
        progress={overrides.progress ?? defaultProgress}
        expirationTime={overrides.expirationTime ?? Date.now() + 60 * 60 * 1000}
        setIframeModule={overrides.setIframeModule ?? setIframeModule}
      />
    );
    return { ...result, setIframeModule };
  }

  it('renders progress bar', () => {
    const { container } = renderHeader();
    expect(container.querySelector('.progress-bar')).toBeInTheDocument();
  });

  it('renders remaining time when expirationTime is valid', () => {
    renderHeader();
    expect(screen.getByText(/mins\./)).toBeInTheDocument();
  });

  it('does not render remaining time when expirationTime is NaN', () => {
    const { container } = renderHeader({ expirationTime: NaN });
    expect(container.querySelector('.remaining-time')).not.toBeInTheDocument();
  });

  it('opens progress modal on click', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHeader();

    await user.click(screen.getByText('Progress'));
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Setup Database')).toBeInTheDocument();
    expect(screen.getByText('Deploy App')).toBeInTheDocument();
  });

  it('shows Restart button when sessionUuid is provided', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHeader({ sessionUuid: 'my-session' });

    await user.click(screen.getByText('Progress'));
    expect(screen.getByText('Restart')).toBeInTheDocument();
  });

  it('hides Restart button when sessionUuid is empty', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHeader({ sessionUuid: '' });

    await user.click(screen.getByText('Progress'));
    expect(screen.queryByText('Restart')).not.toBeInTheDocument();
  });

  it('calls restartLab when Restart button is clicked', async () => {
    const { restartLab } = await import('./utils');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHeader();

    await user.click(screen.getByText('Progress'));
    await user.click(screen.getByText('Restart'));
    expect(restartLab).toHaveBeenCalled();
  });

  it('allows navigation to completed modules', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { setIframeModule } = renderHeader();

    await user.click(screen.getByText('Progress'));

    // module-01 is completed, so it should be a clickable button
    const introButton = screen.getByRole('button', { name: 'Introduction' });
    await user.click(introButton);
    expect(setIframeModule).toHaveBeenCalledWith('module-01');
  });

  it('closes modal on Close button', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderHeader();

    await user.click(screen.getByText('Progress'));
    expect(screen.getByText('Introduction')).toBeInTheDocument();

    await user.click(screen.getByText('Close'));
    // Modal content should be gone
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
