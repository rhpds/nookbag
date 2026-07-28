import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import RemainingTime from './remaining-time';

describe('RemainingTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays remaining minutes', () => {
    const now = Date.now();
    const expirationTime = now + 30 * 60 * 1000; // 30 mins from now

    render(<RemainingTime expirationTime={expirationTime} />);
    expect(screen.getByText(/30 mins\./)).toBeInTheDocument();
  });

  it('updates countdown on interval', () => {
    const now = Date.now();
    const expirationTime = now + 10 * 60 * 1000; // 10 mins

    render(<RemainingTime expirationTime={expirationTime} />);
    expect(screen.getByText(/10 mins\./)).toBeInTheDocument();

    // Advance 2 minutes
    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(screen.getByText(/8 mins\./)).toBeInTheDocument();
  });

  it('shows 0 mins when time has expired', () => {
    const now = Date.now();
    const expirationTime = now - 1000; // already expired

    render(<RemainingTime expirationTime={expirationTime} />);
    expect(screen.getByText(/0 mins\./)).toBeInTheDocument();
  });

  it('handles non-finite expiration time', () => {
    render(<RemainingTime expirationTime={NaN} />);
    expect(screen.getByText(/0 mins\./)).toBeInTheDocument();
  });
});
