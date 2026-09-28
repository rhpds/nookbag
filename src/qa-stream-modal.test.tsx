import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import QaStreamModal from './qa-stream-modal';
import { MockEventSource } from './test-setup';

function latestInstance(): MockEventSource {
  const instance = MockEventSource.instances[MockEventSource.instances.length - 1];
  if (!instance) throw new Error('No EventSource instance was created');
  return instance;
}

/** Confirms the pending run — the point at which the EventSource actually opens. */
function clickRun() {
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
}

describe('QaStreamModal', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  it('opens in an idle confirmation state and does not open an EventSource on mount', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);

    expect(MockEventSource.instances).toHaveLength(0);
    expect(screen.getByText('GET /stream/qa/healthcheck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText(/Run Healthcheck now\?/)).toBeInTheDocument();
  });

  it('shows a formatted title for the stage', () => {
    render(<QaStreamModal stage="e2e" onClose={vi.fn()} />);
    expect(screen.getByText('E2E')).toBeInTheDocument();
  });

  it('uses low-consequence copy and a "primary" Run button for the read-only "healthcheck" stage', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);

    expect(screen.getByText(/read-only check/)).toBeInTheDocument();
    expect(screen.queryByText(/may affect workshop progress/)).not.toBeInTheDocument();

    const runButton = screen.getByRole('button', { name: 'Run' });
    expect(runButton).toHaveClass('pf-m-primary');
    expect(runButton).not.toHaveClass('pf-m-warning');
  });

  it('keeps the cautious copy and "warning" Run button for other stages (e.g. "e2e")', () => {
    render(<QaStreamModal stage="e2e" onClose={vi.fn()} />);

    expect(screen.getByText(/may affect workshop progress/)).toBeInTheDocument();
    expect(screen.queryByText(/read-only check/)).not.toBeInTheDocument();

    const runButton = screen.getByRole('button', { name: 'Run' });
    expect(runButton).toHaveClass('pf-m-warning');
    expect(runButton).not.toHaveClass('pf-m-primary');
  });

  it('Cancel calls onClose without ever opening an EventSource', () => {
    const onClose = vi.fn();
    render(<QaStreamModal stage="healthcheck" onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(MockEventSource.instances).toHaveLength(0);
  });

  it('clicking Run opens an EventSource to /stream/qa/{stage}', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);

    clickRun();

    expect(MockEventSource.instances).toHaveLength(1);
    expect(latestInstance().url).toBe('/stream/qa/healthcheck');
  });

  it('appends JSON-encoded output lines to the console', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
    clickRun();
    const es = latestInstance();

    act(() => {
      es.onmessage?.({ data: JSON.stringify('Starting healthcheck...') } as MessageEvent);
      es.onmessage?.({ data: JSON.stringify('TASK [gather facts]') } as MessageEvent);
    });

    expect(screen.getByText('Starting healthcheck...')).toBeInTheDocument();
    expect(screen.getByText('TASK [gather facts]')).toBeInTheDocument();
  });

  it('handles the plain-text "Starting..." line (not JSON-encoded)', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
    clickRun();
    const es = latestInstance();

    act(() => {
      es.onmessage?.({ data: 'Starting healthcheck for qa...' } as MessageEvent);
    });

    expect(screen.getByText('Starting healthcheck for qa...')).toBeInTheDocument();
  });

  it('closes the EventSource and disables Retry while running, re-enabling on __DONE__', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
    clickRun();
    const es = latestInstance();

    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();

    act(() => {
      es.onmessage?.({ data: '__DONE__' } as MessageEvent);
    });

    expect(es.close).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeDisabled();
  });

  it('shows an error and closes the stream on onerror, without leaving it open for auto-retry', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
    clickRun();
    const es = latestInstance();

    act(() => {
      es.onerror?.(new Event('error'));
    });

    expect(es.close).toHaveBeenCalled();
    expect(screen.getByText(/Connection lost or the stream failed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).not.toBeDisabled();
  });

  it('Retry clears prior output and opens a fresh EventSource', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
    clickRun();
    const first = latestInstance();

    act(() => {
      first.onmessage?.({ data: JSON.stringify('some output') } as MessageEvent);
      first.onmessage?.({ data: '__DONE__' } as MessageEvent);
    });
    expect(screen.getByText('some output')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.queryByText('some output')).not.toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1]).not.toBe(first);
  });

  it('Close calls onClose and closes any open EventSource', () => {
    const onClose = vi.fn();
    render(<QaStreamModal stage="healthcheck" onClose={onClose} />);
    clickRun();
    const es = latestInstance();

    // Both the modal box's built-in X button and our footer button are
    // labeled "Close" — the footer button is the one with visible text.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    const footerClose = closeButtons.find((btn) => btn.textContent === 'Close');
    if (!footerClose) throw new Error('Footer Close button not found');
    fireEvent.click(footerClose);

    expect(es.close).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
    clickRun();
    const es = latestInstance();

    unmount();

    expect(es.close).toHaveBeenCalled();
  });

  it('unmounting before Run is clicked never opens an EventSource', () => {
    const { unmount } = render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);

    unmount();

    expect(MockEventSource.instances).toHaveLength(0);
  });
});
