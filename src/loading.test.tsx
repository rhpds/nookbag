import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Loading from './loading';

describe('Loading', () => {
  it('renders loading text when visible', () => {
    render(<Loading text="Running validation..." isVisible={true} />);
    expect(screen.getByText('Running validation...')).toBeInTheDocument();
  });

  it('renders spinner element when visible', () => {
    const { container } = render(<Loading text="Setting up..." isVisible={true} />);
    expect(container.querySelector('.loading')).toBeInTheDocument();
  });

  it('renders nothing when not visible', () => {
    const { container } = render(<Loading text="Hidden" isVisible={false} />);
    expect(container.querySelector('.loading-wrapper')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('shows correct text for different stages', () => {
    const { rerender } = render(<Loading text="Running setup..." isVisible={true} />);
    expect(screen.getByText('Running setup...')).toBeInTheDocument();

    rerender(<Loading text="Running solve..." isVisible={true} />);
    expect(screen.getByText('Running solve...')).toBeInTheDocument();

    rerender(<Loading text="Running validation..." isVisible={true} />);
    expect(screen.getByText('Running validation...')).toBeInTheDocument();
  });
});
