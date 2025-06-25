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
