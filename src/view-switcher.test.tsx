import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useSWR from 'swr/immutable';
import ViewSwitcher from './view-switcher';
import { MockEventSource } from './test-setup';

// Mock useSWR (immutable) — same convention as app.test.tsx. Avoids relying on
// the real SWR cache (which would leak state between test cases sharing the
// same /runner/api/config key).
vi.mock('swr/immutable', () => ({
  default: vi.fn(() => ({
    data: null,
    error: null,
    mutate: vi.fn(),
    isValidating: false,
    isLoading: false,
  })),
}));

function setup(props: Partial<React.ComponentProps<typeof ViewSwitcher>> = {}) {
  const onModeChange = props.onModeChange ?? vi.fn();
  const result = render(
    <ViewSwitcher
      defaultMode={props.defaultMode ?? 'split'}
      onModeChange={onModeChange}
      persistUrlState={props.persistUrlState}
      devMode={props.devMode}
    />
  );
  return { ...result, onModeChange };
}

function expandPanel() {
  const trigger = screen.getByRole('button', { name: 'View mode switcher' });
  fireEvent.pointerDown(trigger, { pointerId: 1 });
  fireEvent.pointerUp(trigger, { pointerId: 1 });
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

describe('ViewSwitcher dev mode buttons', () => {
  const mockUseSWR = vi.mocked(useSWR);

  beforeEach(() => {
    vi.mocked(window.localStorage.getItem).mockReturnValue(null);
    mockUseSWR.mockReturnValue({
      data: null,
      error: null,
      mutate: vi.fn(),
      isValidating: false,
      isLoading: false,
    } as ReturnType<typeof useSWR>);
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render qa buttons when devMode is false, even if stages are available', () => {
    mockUseSWR.mockReturnValue({
      data: { qa: ['healthcheck', 'e2e'] },
      error: null,
      mutate: vi.fn(),
      isValidating: false,
      isLoading: false,
    } as ReturnType<typeof useSWR>);

    setup({ devMode: false });
    expandPanel();

    expect(screen.queryByText('Healthcheck')).not.toBeInTheDocument();
    expect(screen.queryByText('E2E')).not.toBeInTheDocument();
  });

  it('does not render qa buttons when devMode is true but no stages are returned', () => {
    setup({ devMode: true });
    expandPanel();

    expect(screen.queryByText('Healthcheck')).not.toBeInTheDocument();
    expect(screen.queryByText('E2E')).not.toBeInTheDocument();
  });

  it('renders one button per discovered qa stage when devMode is true', () => {
    mockUseSWR.mockReturnValue({
      data: { qa: ['healthcheck', 'e2e'] },
      error: null,
      mutate: vi.fn(),
      isValidating: false,
      isLoading: false,
    } as ReturnType<typeof useSWR>);

    setup({ devMode: true });
    expandPanel();

    expect(screen.getByText('Healthcheck')).toBeInTheDocument();
    expect(screen.getByText('E2E')).toBeInTheDocument();
  });

  it('opens QaStreamModal for the clicked stage', () => {
    mockUseSWR.mockReturnValue({
      data: { qa: ['healthcheck', 'e2e'] },
      error: null,
      mutate: vi.fn(),
      isValidating: false,
      isLoading: false,
    } as ReturnType<typeof useSWR>);

    setup({ devMode: true });
    expandPanel();

    fireEvent.click(screen.getByText('Healthcheck'));

    expect(screen.getByText('GET /stream/qa/healthcheck')).toBeInTheDocument();
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe('/stream/qa/healthcheck');
  });

  it('qa buttons are not independent Tab stops (tabIndex -1), consistent with mode buttons', () => {
    mockUseSWR.mockReturnValue({
      data: { qa: ['healthcheck', 'e2e'] },
      error: null,
      mutate: vi.fn(),
      isValidating: false,
      isLoading: false,
    } as ReturnType<typeof useSWR>);

    setup({ devMode: true });
    expandPanel();

    expect(screen.getByText('Healthcheck').closest('button')).toHaveAttribute('tabIndex', '-1');
    expect(screen.getByText('E2E').closest('button')).toHaveAttribute('tabIndex', '-1');
  });

  it('ArrowRight/ArrowLeft roving navigation reaches qa buttons from the mode buttons', () => {
    mockUseSWR.mockReturnValue({
      data: { qa: ['healthcheck', 'e2e'] },
      error: null,
      mutate: vi.fn(),
      isValidating: false,
      isLoading: false,
    } as ReturnType<typeof useSWR>);

    setup({ devMode: true });
    expandPanel();

    const toolbar = screen.getByRole('toolbar', { name: 'View mode switcher' });
    const active = toolbar.querySelector<HTMLButtonElement>('.sr-mode-btn.sr-active');
    active?.focus();

    // Split (active) -> Tabs -> Healthcheck -> E2E
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByText('Healthcheck').closest('button'));

    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByText('E2E').closest('button'));

    // Wraps back around to the first mode button (Instructions)
    fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveAttribute('title', expect.stringContaining('Full-width instructions'));
  });
});
