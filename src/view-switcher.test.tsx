import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ViewSwitcher from './view-switcher';

function setup(props: Partial<React.ComponentProps<typeof ViewSwitcher>> = {}) {
  const onModeChange = props.onModeChange ?? vi.fn();
  const result = render(
    <ViewSwitcher defaultMode={props.defaultMode ?? 'split'} onModeChange={onModeChange} persistUrlState={props.persistUrlState} />
  );
  return { ...result, onModeChange };
}

describe('ViewSwitcher', () => {
  beforeEach(() => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    Object.defineProperty(window, 'location', {
      value: { protocol: 'http:', hostname: 'localhost', search: '', href: 'http://localhost/', origin: 'http://localhost' },
      writable: true,
    });
    // Stub history.replaceState
    window.history.replaceState = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders trigger button with accessible label', () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'View mode switcher' });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('sr-trigger');
  });

  it('expands panel on trigger click', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'View mode switcher' });

    fireEvent.pointerDown(trigger, { pointerId: 1 });
    fireEvent.pointerUp(trigger, { pointerId: 1 });

    expect(screen.getByTitle('Full-width instructions')).toBeInTheDocument();
    expect(screen.getByTitle('Side by side')).toBeInTheDocument();
    expect(screen.getByTitle('Full-width tabs')).toBeInTheDocument();
  });

  it('calls onModeChange when a mode is selected', async () => {
    const { onModeChange } = setup();
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'View mode switcher' });

    // Expand
    fireEvent.pointerDown(trigger, { pointerId: 1 });
    fireEvent.pointerUp(trigger, { pointerId: 1 });

    // Select instructions mode
    await user.click(screen.getByTitle('Full-width instructions'));
    expect(onModeChange).toHaveBeenCalledWith('instructions');
  });

  it('calls onModeChange with default mode on mount', () => {
    const onModeChange = vi.fn();
    render(<ViewSwitcher defaultMode="tabs" onModeChange={onModeChange} />);
    expect(onModeChange).toHaveBeenCalledWith('tabs');
  });

  it('cycles modes on Alt+V keyboard shortcut', () => {
    const onModeChange = vi.fn();
    render(<ViewSwitcher defaultMode="split" onModeChange={onModeChange} />);

    // Alt+V should cycle: split -> tabs
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', altKey: true }));
    });
    expect(onModeChange).toHaveBeenCalledWith('tabs');

    // Alt+V again: tabs -> instructions
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', altKey: true }));
    });
    expect(onModeChange).toHaveBeenCalledWith('instructions');
  });

  it('closes expanded panel on Escape', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'View mode switcher' });

    // Expand
    fireEvent.pointerDown(trigger, { pointerId: 1 });
    fireEvent.pointerUp(trigger, { pointerId: 1 });

    expect(screen.getByTitle('Side by side')).toBeInTheDocument();

    // Press Escape on the popout container
    const popout = screen.getByTitle('Side by side').closest('.sr-popout');
    if (popout) {
      fireEvent.keyDown(popout, { key: 'Escape' });
    }

    // Panel should collapse -- buttons should become hidden via tabIndex
    const btn = screen.getByTitle('Side by side');
    expect(btn).toHaveAttribute('tabindex', '-1');
  });

  it('reads mode from localStorage on mount', () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
      if (key === 'sr-panel-mode') return 'instructions';
      return null;
    });

    const onModeChange = vi.fn();
    render(<ViewSwitcher defaultMode="split" onModeChange={onModeChange} />);
    expect(onModeChange).toHaveBeenCalledWith('instructions');
  });

  it('reads mode from URL param over localStorage', () => {
    vi.mocked(window.localStorage.getItem).mockImplementation((key) => {
      if (key === 'sr-panel-mode') return 'instructions';
      return null;
    });
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?view=tabs', href: 'http://localhost/?view=tabs' },
      writable: true,
    });

    const onModeChange = vi.fn();
    render(<ViewSwitcher defaultMode="split" onModeChange={onModeChange} />);
    expect(onModeChange).toHaveBeenCalledWith('tabs');
  });

  it('persists mode to localStorage on change', () => {
    const { onModeChange } = setup();
    const trigger = screen.getByRole('button', { name: 'View mode switcher' });

    fireEvent.pointerDown(trigger, { pointerId: 1 });
    fireEvent.pointerUp(trigger, { pointerId: 1 });

    fireEvent.click(screen.getByTitle('Full-width tabs'));

    expect(window.localStorage.setItem).toHaveBeenCalledWith('sr-panel-mode', 'tabs');
  });

  it('marks the active mode button with aria-pressed', () => {
    setup({ defaultMode: 'split' });
    const trigger = screen.getByRole('button', { name: 'View mode switcher' });

    fireEvent.pointerDown(trigger, { pointerId: 1 });
    fireEvent.pointerUp(trigger, { pointerId: 1 });

    expect(screen.getByTitle('Side by side')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTitle('Full-width instructions')).toHaveAttribute('aria-pressed', 'false');
  });
});
