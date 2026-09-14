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

describe('QaStreamModal', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
  });

  it('opens an EventSource to /stream/qa/{stage} on mount and shows the endpoint', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);

    expect(MockEventSource.instances).toHaveLength(1);
    expect(latestInstance().url).toBe('/stream/qa/healthcheck');
    expect(screen.getByText('GET /stream/qa/healthcheck')).toBeInTheDocument();
  });

  it('shows a formatted title for the stage', () => {
    render(<QaStreamModal stage="e2e" onClose={vi.fn()} />);
    expect(screen.getByText('E2E')).toBeInTheDocument();
  });

  it('appends JSON-encoded output lines to the console', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
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
    const es = latestInstance();

    act(() => {
      es.onmessage?.({ data: 'Starting healthcheck for qa...' } as MessageEvent);
    });

    expect(screen.getByText('Starting healthcheck for qa...')).toBeInTheDocument();
  });

  it('closes the EventSource and disables Retry while running, re-enabling on __DONE__', () => {
    render(<QaStreamModal stage="healthcheck" onClose={vi.fn()} />);
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
    const es = latestInstance();

    unmount();

    expect(es.close).toHaveBeenCalled();
  });
});
