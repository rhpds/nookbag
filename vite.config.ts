import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { load as yamlLoad } from 'js-yaml';

type TabConfig = {
  name: string;
  url?: string;
  port?: string;
  path?: string;
  external?: boolean;
  type?: string;
  secondary_name?: string;
  secondary_port?: string;
  secondary_path?: string;
  secondary_url?: string;
};

// Relative paths (e.g. /wetty) are resolved against the local Traefik instance.
// Override with HEALTHZ_BASE_URL env var for different environments.
const BASE_URL = process.env.HEALTHZ_BASE_URL || 'http://traefik:80';

function toAbsoluteUrl(raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/')) return `${BASE_URL}${raw}`;
  return null;
}

function resolveTabUrls(tab: TabConfig): { url: string | null; secondary_url: string | null } {
  const t = { ...tab };

  switch (t.type) {
    case 'double-terminal':
      t.path = '/tty-top';
      t.port = '443';
      t.secondary_path = '/tty-bottom';
      t.secondary_port = '443';
      break;
    case 'terminal':
      t.path = '/tty1';
      t.port = '443';
      break;
    case 'secondary-terminal':
      t.path = '/tty2';
      t.port = '443';
      break;
    case 'codeserver':
      t.path = '/';
      t.port = '8443';
      break;
    case 'parasol':
      t.path = '/';
      t.port = '8005';
      break;
  }

  let url: string | null = null;
  if (t.url) {
    url = toAbsoluteUrl(t.url);
  } else if (t.port) {
    const proto = t.port === '443' || t.port === '8443' ? 'https' : 'http';
    url = `${proto}://localhost:${t.port}${t.path || ''}`;
  }

  let secondary_url: string | null = null;
  if (t.secondary_url) {
    secondary_url = toAbsoluteUrl(t.secondary_url);
  } else if (t.secondary_path && (t.secondary_port || t.port)) {
    const port = t.secondary_port || t.port!;
    const proto = port === '443' || port === '8443' ? 'https' : 'http';
    secondary_url = `${proto}://localhost:${port}${t.secondary_path}`;
  }

  return { url, secondary_url };
}

function probeUrl(
  url: string,
  timeoutMs = 5000,
  maxRedirects = 5,
): Promise<{ reachable: boolean; statusCode?: number; error?: string }> {
  return new Promise((resolve) => {
    let redirectsLeft = maxRedirects;

    function attempt(target: string) {
      try {
        const parsed = new URL(target);
        const doRequest = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
        const req = doRequest(
          target,
          { method: 'HEAD', timeout: timeoutMs, rejectUnauthorized: false },
          (res) => {
            res.resume();
            const code = res.statusCode ?? 0;

            if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirectsLeft > 0) {
              redirectsLeft--;
              const next = res.headers.location.startsWith('http')
                ? res.headers.location
                : new URL(res.headers.location, target).href;
              attempt(next);
              return;
            }

            resolve({ reachable: code >= 200 && code < 400, statusCode: code });
          },
        );
        req.on('error', (err: Error) => resolve({ reachable: false, error: err.message }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ reachable: false, error: `timeout after ${timeoutMs}ms` });
        });
        req.end();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        resolve({ reachable: false, error: msg });
      }
    }

    attempt(url);
  });
}

function loadUiConfig(root: string): Record<string, unknown> | null {
  for (const filename of ['ui-config.yml', 'zero-touch-config.yml']) {
    const filepath = join(root, filename);
    if (existsSync(filepath)) {
      const text = readFileSync(filepath, 'utf-8');
      return yamlLoad(text) as Record<string, unknown>;
    }
  }
  return null;
}

function checkContent(root: string, config: Record<string, unknown>): Record<string, unknown> {
  const antora = config.antora as { dir?: string; name?: string; version?: string; modules?: unknown[] } | undefined;
  const isShowroom = config.type === 'showroom';
  const dir = antora?.dir || (isShowroom ? 'www' : 'antora');
  const name = antora?.name || 'modules';
  const version = antora?.version;

  const segments = [dir, name];
  if (version) segments.push(version);
  const contentDir = join(root, ...segments);
  const indexFile = join(contentDir, 'index.html');

  const dirExists = existsSync(contentDir);
  const indexExists = dirExists && existsSync(indexFile);
  const path = segments.join('/');

  return {
    path,
    dirExists,
    indexExists,
    reachable: dirExists && indexExists,
    ...(!dirExists ? { error: `content directory not found: ${path}/` } : {}),
    ...(!indexExists && dirExists ? { error: `index.html not found in ${path}/` } : {}),
  };
}

function healthCheck(): Plugin {
  return {
    name: 'health-check',
    configureServer(server) {
      server.middlewares.use('/readyz', async (_req, res) => {
        try {
          const root = server.config.root;
          const config = loadUiConfig(root);
          if (!config) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify({
              status: 'ok', service: 'nookbag',
              content: { reachable: false, error: 'no config file found' },
              tabs: [],
            }, null, 2));
            return;
          }

          const content = checkContent(root, config);

          const tabs = (Array.isArray(config.tabs) ? config.tabs : []) as TabConfig[];
          const checks = tabs.flatMap((tab) => {
            const { url, secondary_url } = resolveTabUrls(tab);
            const entries: Promise<Record<string, unknown>>[] = [];

            if (url) {
              entries.push(
                probeUrl(url).then((result) => ({ name: tab.name, url, ...result })),
              );
            } else {
              entries.push(Promise.resolve({ name: tab.name, url: null, reachable: false, error: 'no url configured' }));
            }

            if (secondary_url) {
              entries.push(
                probeUrl(secondary_url).then((result) => ({
                  name: `${tab.name} (${tab.secondary_name || 'secondary'})`,
                  url: secondary_url,
                  ...result,
                })),
              );
            }

            return entries;
          });

          const tabResults = await Promise.all(checks);
          const allHealthy =
            content.reachable !== false &&
            (tabResults.length === 0 || tabResults.every((r) => r.reachable));

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = allHealthy ? 200 : 503;
          res.end(JSON.stringify({
            status: allHealthy ? 'ok' : 'degraded',
            service: 'nookbag',
            content,
            tabs: tabResults,
          }, null, 2));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({ status: 'error', service: 'nookbag', error: msg }));
        }
      });

      server.middlewares.use('/healthz', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', service: 'nookbag' }));
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [healthCheck(), react()],
  root: './src',
  build: {
    outDir: '../dist',
  },
  // Use subpath when served behind Traefik at /nookbag
  base: command === 'serve' ? '/nookbag/' : './',
  server: {
    allowedHosts: true,
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    hmr: {
      // Connect HMR via Traefik
      clientPort: 7080,
      path: '/nookbag',
    },
  },
}));
