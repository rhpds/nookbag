import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock fetch for testing
global.fetch = vi.fn();

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    protocol: 'http:',
    hostname: 'localhost',
    search: '',
  },
  writable: true,
});

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock HTMLIFrameElement
Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
  get() {
    return {
      location: {
        pathname: '/test/module.html',
      },
    };
  },
});

// jsdom does not implement Element.scrollTo — app.tsx's goToTop() calls it on
// every module navigation (Next/Previous/progress-header jump).
Element.prototype.scrollTo = vi.fn();

// Minimal EventSource mock for SSE-based components (QaStreamModal). Tests can
// import MockEventSource to inspect/drive instances via `.onmessage`/`.onerror`.
export class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

Object.defineProperty(window, 'EventSource', {
  value: MockEventSource,
  writable: true,
});
(globalThis as unknown as { EventSource: typeof MockEventSource }).EventSource = MockEventSource;
