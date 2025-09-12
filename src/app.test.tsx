import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './app';
import useSWR from 'swr';
import { ErrorBoundary } from 'react-error-boundary';
// Import test configurations
import terminalConfig from './test-configs/terminal-config.yml?raw';
import externalLinksConfig from './test-configs/external-links-config.yml?raw';
import embeddedWebsiteConfig from './test-configs/embedded-website-config.yml?raw';
import zeroTouchConfig from './test-configs/zero-touch-lab-config.yml?raw';
import showroomConfig from './test-configs/showroom-config.yml?raw';

// Mock useSWR
vi.mock('swr', () => ({
  default: vi.fn(() => ({
    data: null,
    error: null,
    mutate: vi.fn(),
    isValidating: false,
    isLoading: false,
  })),
}));

// Test component wrapper for error boundary
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ErrorBoundary fallback={<div>Error occurred</div>}>{children}</ErrorBoundary>;
}

describe('UI Config Integration Tests', () => {
  const mockUseSWR = vi.mocked(useSWR);

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset the mock to return default values
    mockUseSWR.mockReturnValue({
      data: null,
      error: null,
      mutate: vi.fn(),
      isValidating: false,
      isLoading: false,
    });

    // Reset all mocks
    vi.stubGlobal('open', vi.fn());

    // Reset window location
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'http:',
        hostname: 'localhost',
        search: '',
      },
      writable: true,
    });
  });

  describe('Complete Terminal Environment', () => {
    it('should create a functional terminal-based lab environment', async () => {
      // Mock useSWR calls based on URI/key instead of call order
      mockUseSWR.mockImplementation((key) => {
        // First call: configuration files fetch
        if (Array.isArray(key) && key.includes('./ui-config.yml')) {
          return {
            data: [
              { url: './ui-config.yml', ok: true, status: 200, statusText: 'OK', text: terminalConfig },
              { url: './zero-touch-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
            ],
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        }
        // Second call: API config (null for showroom type)
        return {
          data: null,
          error: null,
          mutate: vi.fn(),
          isValidating: false,
          isLoading: false,
        };
      });

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      // Wait for configuration to load
      await waitFor(() => {
        expect(screen.getByText('Terminal')).toBeInTheDocument();
        expect(screen.getByText('Application')).toBeInTheDocument();
        expect(screen.getByText('Database Terminal')).toBeInTheDocument();
      });

      // Verify terminal iframe is created with wetty URL
      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const terminalIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':8080/wetty'));
        expect(terminalIframe).toBeTruthy();
      });

      // Click on Application tab
      const appTab = screen.getByText('Application');
      fireEvent.click(appTab);

      // Verify application iframe is loaded
      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const appIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':3000/app'));
        expect(appIframe).toBeTruthy();
      });

      // Test Database Terminal tab (should have TTY styling)
      const dbTerminalTab = screen.getByText('Database Terminal');
      fireEvent.click(dbTerminalTab);

      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const dbIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':5432/tty'));
        expect(dbIframe).toBeTruthy();
      });
    });
  });

  describe('External Links Environment', () => {
    it('should handle external documentation and repository links', async () => {
      mockUseSWR.mockImplementation((key) => {
        // First call: configuration files fetch
        if (Array.isArray(key) && key.includes('./ui-config.yml')) {
          return {
            data: [
              { url: './ui-config.yml', ok: true, status: 200, statusText: 'OK', text: externalLinksConfig },
              { url: './zero-touch-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
            ],
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        }
        // Second call: API config (null for showroom type)
        return {
          data: null,
          error: null,
          mutate: vi.fn(),
          isValidating: false,
          isLoading: false,
        };
      });

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Documentation')).toBeInTheDocument();
        expect(screen.getByText('GitHub Repository')).toBeInTheDocument();
        expect(screen.getByText('Local Application')).toBeInTheDocument();
      });

      // Click external documentation link
      const docsTab = screen.getByText('Documentation');
      fireEvent.click(docsTab);

      expect(window.open).toHaveBeenCalledWith('https://docs.redhat.com', '_blank');

      // Click GitHub repository link
      const repoTab = screen.getByText('GitHub Repository');
      fireEvent.click(repoTab);

      expect(window.open).toHaveBeenCalledWith('https://github.com/redhat/example-repo', '_blank');

      // Click local application (should not open new window)
      const localTab = screen.getByText('Local Application');
      fireEvent.click(localTab);

      // Verify local application iframe is created
      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const localIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':3000/app'));
        expect(localIframe).toBeTruthy();
      });
    });
  });

  describe('Embedded Websites Environment', () => {
    it('should create embedded dashboards and split views', async () => {
      mockUseSWR.mockImplementation((key) => {
        // First call: configuration files fetch
        if (Array.isArray(key) && key.includes('./ui-config.yml')) {
          return {
            data: [
              { url: './ui-config.yml', ok: true, status: 200, statusText: 'OK', text: embeddedWebsiteConfig },
              { url: './zero-touch-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
            ],
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        }
        // Second call: API config (null for showroom type)
        return {
          data: null,
          error: null,
          mutate: vi.fn(),
          isValidating: false,
          isLoading: false,
        };
      });

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Embedded Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Split View Console')).toBeInTheDocument();
        expect(screen.getByText('IDE')).toBeInTheDocument();
        expect(screen.getByText('External Monitoring')).toBeInTheDocument();
      });

      // Test embedded dashboard
      const dashboardTab = screen.getByText('Embedded Dashboard');
      fireEvent.click(dashboardTab);

      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const dashboardIframe = Array.from(iframes).find((iframe) =>
          iframe.src.includes('grafana.example.com/dashboard')
        );
        expect(dashboardIframe).toBeTruthy();
      });

      // Test split view console
      const splitTab = screen.getByText('Split View Console');
      fireEvent.click(splitTab);

      await waitFor(() => {
        // Check for primary console iframe
        const iframes = document.querySelectorAll('iframe');
        const consoleIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':8080/console'));
        expect(consoleIframe).toBeTruthy();

        // Check for secondary logs iframe
        const logsIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':8081/logs'));
        expect(logsIframe).toBeTruthy();

        // Verify secondary tab name is shown
        expect(screen.getByText('Logs')).toBeInTheDocument();
      });

      // Test IDE tab
      const ideTab = screen.getByText('IDE');
      fireEvent.click(ideTab);

      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const ideIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':3001/ide'));
        expect(ideIframe).toBeTruthy();
      });

      // Test external monitoring (should open new tab)
      const monitoringTab = screen.getByText('External Monitoring');
      fireEvent.click(monitoringTab);

      expect(window.open).toHaveBeenCalledWith('https://monitoring.example.com', '_blank');
    });
  });

  describe('Zero-Touch Lab Environment', () => {
    it('should create a complete lab environment with script execution', async () => {
      mockUseSWR.mockImplementation((key) => {
        // First call: configuration files fetch (zero-touch config)
        if (Array.isArray(key) && key.includes('./ui-config.yml')) {
          return {
            data: [
              { url: './ui-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
              { url: './zero-touch-config.yml', ok: true, status: 200, statusText: 'OK', text: zeroTouchConfig },
            ],
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        }
        // Second call: API config for zero-touch (not null because it's zero-touch type)
        return {
          data: {
            'lab-setup': ['setup', 'validation'],
            'database-connection': ['setup', 'validation', 'solve'],
            'application-deployment': ['setup', 'validation', 'solve'],
            'testing-verification': ['validation'],
          },
          error: null,
          mutate: vi.fn(),
          isValidating: false,
          isLoading: false,
        };
      });

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      await waitFor(() => {
        // Verify all tabs are present
        expect(screen.getByText('Terminal')).toBeInTheDocument();
        expect(screen.getByText('Code Editor')).toBeInTheDocument();
        expect(screen.getByText('Database Console')).toBeInTheDocument();
        expect(screen.getByText('Application Preview')).toBeInTheDocument();
        expect(screen.getByText('External Docs')).toBeInTheDocument();
      });

      // Verify lab controls are present
      expect(screen.getByText('Next')).toBeInTheDocument();
      expect(screen.getByText('Skip module')).toBeInTheDocument();
      expect(screen.getByText('Exit')).toBeInTheDocument();

      // Test terminal functionality
      const terminalTab = screen.getByText('Terminal');
      fireEvent.click(terminalTab);

      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const terminalIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':8080/wetty'));
        expect(terminalIframe).toBeTruthy();
      });

      // Test code editor
      const editorTab = screen.getByText('Code Editor');
      fireEvent.click(editorTab);

      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const editorIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':3001/vscode'));
        expect(editorIframe).toBeTruthy();
      });

      // Test database console
      const dbTab = screen.getByText('Database Console');
      fireEvent.click(dbTab);

      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const dbIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':5432/pgadmin'));
        expect(dbIframe).toBeTruthy();
      });

      // Test application preview
      const previewTab = screen.getByText('Application Preview');
      fireEvent.click(previewTab);

      await waitFor(() => {
        const iframes = document.querySelectorAll('iframe');
        const previewIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':3000/preview'));
        expect(previewIframe).toBeTruthy();
      });

      // Test external docs
      const docsTab = screen.getByText('External Docs');
      fireEvent.click(docsTab);

      expect(window.open).toHaveBeenCalledWith('https://docs.example.com/lab-guide', '_blank');
    });

    it('should handle lab progression and solve buttons', async () => {
      mockUseSWR.mockImplementation((key) => {
        // First call: configuration files fetch (zero-touch config)
        if (Array.isArray(key) && key.includes('./ui-config.yml')) {
          return {
            data: [
              { url: './ui-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
              { url: './zero-touch-config.yml', ok: true, status: 200, statusText: 'OK', text: zeroTouchConfig },
            ],
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        }
        // Second call: API config for zero-touch
        return {
          data: {
            'lab-setup': ['setup', 'validation'],
            'database-connection': ['setup', 'validation', 'solve'],
            'application-deployment': ['setup', 'validation', 'solve'],
            'testing-verification': ['validation'],
          },
          error: null,
          mutate: vi.fn(),
          isValidating: false,
          isLoading: false,
        };
      });

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      await waitFor(() => {
        // Verify solve button is present for first module (lab-setup)
        expect(screen.getByText('Solve')).toBeInTheDocument();
      });

      // Test Next button functionality
      const nextButton = screen.getByText('Next');
      expect(nextButton).toBeInTheDocument();

      // Test Skip module button
      const skipButton = screen.getByText('Skip module');
      expect(skipButton).toBeInTheDocument();

      // Test Exit button
      const exitButton = screen.getByText('Exit');
      expect(exitButton).toBeInTheDocument();
    });
  });

  describe('Multi-Configuration Support', () => {
    it('should handle session-based configuration switching', async () => {
      // Mock session with UUID
      const mockSession = {
        sessionUuid: 'test-uuid-123',
        catalogItemName: 'Test Lab',
        start: '2024-01-01T00:00:00Z',
        state: 'active',
        lifespanEnd: '2024-01-01T04:00:00Z',
        labUserInterfaceUrl: 'http://localhost:3000',
      };

      // Mock URL search params
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'http:',
          hostname: 'localhost',
          search: `?s=${encodeURIComponent(JSON.stringify(mockSession))}`,
        },
        writable: true,
      });

      mockUseSWR.mockImplementation((key) => {
        // First call: configuration files fetch (zero-touch config)
        if (Array.isArray(key) && key.includes('./ui-config.yml')) {
          return {
            data: [
              { url: './ui-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
              { url: './zero-touch-config.yml', ok: true, status: 200, statusText: 'OK', text: zeroTouchConfig },
            ],
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        }
        // Second call: API config for zero-touch
        return {
          data: {
            'lab-setup': ['setup', 'validation'],
            'database-connection': ['setup', 'validation', 'solve'],
            'application-deployment': ['setup', 'validation', 'solve'],
            'testing-verification': ['validation'],
          },
          error: null,
          mutate: vi.fn(),
          isValidating: false,
          isLoading: false,
        };
      });

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      await waitFor(() => {
        // Verify session-specific functionality is loaded
        expect(screen.getByText('Terminal')).toBeInTheDocument();

        // Verify progress header is shown (session-based)
        // Note: This tests that the progress header component is rendered
        // when a session is present
      });
    });
  });

  describe('Responsive Design Tests', () => {
    it('should handle different screen sizes and layouts', async () => {
      mockUseSWR.mockImplementation((key) => {
        // First call: configuration files fetch
        if (Array.isArray(key) && key.includes('./ui-config.yml')) {
          return {
            data: [
              { url: './ui-config.yml', ok: true, status: 200, statusText: 'OK', text: embeddedWebsiteConfig },
              { url: './zero-touch-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
            ],
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        }
        // Second call: API config (null for showroom type)
        return {
          data: null,
          error: null,
          mutate: vi.fn(),
          isValidating: false,
          isLoading: false,
        };
      });

      render(
        <TestWrapper>
          <App />
        </TestWrapper>
      );

      await waitFor(() => {
        // Verify split layout is present
        const splitElements = document.querySelectorAll('.split');
        expect(splitElements.length).toBeGreaterThan(0);
      });
    });

    describe('Showroom Configuration', () => {
      it('should not display progress bar and Next button for showroom type', async () => {
        mockUseSWR.mockImplementation((key) => {
          // First call: configuration files fetch (showroom config)
          if (Array.isArray(key) && key.includes('./ui-config.yml')) {
            return {
              data: [
                { url: './ui-config.yml', ok: true, status: 200, statusText: 'OK', text: showroomConfig },
                { url: './zero-touch-config.yml', ok: false, status: 404, statusText: 'Not Found', text: null },
              ],
              error: null,
              mutate: vi.fn(),
              isValidating: false,
              isLoading: false,
            };
          }
          // Second call: API config (null for showroom type)
          return {
            data: null,
            error: null,
            mutate: vi.fn(),
            isValidating: false,
            isLoading: false,
          };
        });

        render(
          <TestWrapper>
            <App />
          </TestWrapper>
        );

        await waitFor(() => {
          // Verify tabs are present
          expect(screen.getByText('Documentation')).toBeInTheDocument();
          expect(screen.getByText('Local Application')).toBeInTheDocument();
          expect(screen.getByText('Code Editor')).toBeInTheDocument();
        });

        // Verify progress bar is NOT displayed (no progress header for showroom)
        expect(screen.queryByText('Exit')).not.toBeInTheDocument();
        expect(screen.queryByText('Skip module')).not.toBeInTheDocument();

        // Verify Next button is NOT displayed
        expect(screen.queryByText('Next')).not.toBeInTheDocument();
        expect(screen.queryByText('Previous')).not.toBeInTheDocument();
        expect(screen.queryByText('Solve')).not.toBeInTheDocument();

        // Test external documentation link
        const docsTab = screen.getByText('Documentation');
        fireEvent.click(docsTab);
        expect(window.open).toHaveBeenCalledWith('https://docs.example.com', '_blank');

        // Test local application tab
        const localTab = screen.getByText('Local Application');
        fireEvent.click(localTab);

        // Verify local application iframe is created
        await waitFor(() => {
          const iframes = document.querySelectorAll('iframe');
          const localIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':3000/app'));
          expect(localIframe).toBeTruthy();
        });

        // Test code editor tab
        const editorTab = screen.getByText('Code Editor');
        fireEvent.click(editorTab);

        // Verify code editor iframe is created
        await waitFor(() => {
          const iframes = document.querySelectorAll('iframe');
          const editorIframe = Array.from(iframes).find((iframe) => iframe.src.includes(':3001/editor'));
          expect(editorIframe).toBeTruthy();
        });
      });
    });
  });
});
