# healthz — Nookbag Health Check Sidecar

A lightweight Python sidecar that exposes health and readiness endpoints for
the nookbag compose stack. Traefik routes `/healthz` and `/readyz` to this
service so orchestrators (and humans) can check whether the stack is up.

## Endpoints

| Path | Method | Purpose |
|------|--------|---------|
| `/healthz` | GET, HEAD | **Liveness probe.** Always returns `200`. |
| `/readyz` | GET, HEAD | **Readiness probe.** Fetches the nookbag UI config, resolves every tab URL, probes the content index page, and returns `200` when everything is reachable or `503` when degraded. |

### `/readyz` response body

```json
{
  "status": "ok | degraded",
  "service": "nookbag",
  "configFile": "ui-config.yml",
  "content": {
    "reachable": true,
    "statusCode": 200,
    "path": "www/modules",
    "url": "http://traefik:80/nookbag/www/modules/index.html"
  },
  "tabs": [
    {
      "name": "Terminal",
      "url": "https://localhost:443/tty1",
      "reachable": true,
      "statusCode": 200
    }
  ]
}
```

## How it works

1. Fetches the first available config file (`ui-config.yml` or
   `zero-touch-config.yml`) from the nookbag service through Traefik.
2. Probes the Antora/showroom content index page (`<content_path>/index.html`).
3. Resolves tab URLs using type-specific defaults (terminal, codeserver,
   parasol, etc.) and probes each one in parallel.  Tabs with non-root
   paths (e.g. `/wetty`, `/tty1`) are probed through the pod's reverse
   proxy (`HEALTHZ_BASE_URL`) since they are not directly reachable on
   `localhost`.  Direct-port services (path `/` or unset) are probed at
   `localhost:<port>`.
4. Returns `200` if the content page and all tabs are reachable, `503`
   otherwise.

Results are cached for `HEALTHZ_CACHE_TTL` seconds (default 5) to avoid
hammering downstream services on repeated polls.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTHZ_PORT` | `8090` | Port the HTTP server listens on. |
| `HEALTHZ_BASE_URL` | `http://traefik:80` | Base URL for fetching config and resolving relative tab paths. |
| `NOOKBAG_BASE` | `/nookbag` | Vite base path where nookbag serves its config files. |
| `HEALTHZ_PROBE_TIMEOUT` | `5` | Per-probe HTTP timeout in seconds. |
| `HEALTHZ_PROBE_WORKERS` | `8` | Max concurrent probe threads. |
| `HEALTHZ_CACHE_TTL` | `5` | Seconds to cache readiness results. |
| `NOOKBAG_VERSION` | `0.0.1` | Reported in the `User-Agent` header (`rhdp-showroom/<version>`). |

## Container image

Built from `nookbag/healthz/Containerfile` using UBI 10 Python 3.12 minimal.
Runs as non-root (UID 1001) and exposes port 8090.

```
podman build -t healthz -f Containerfile .
podman run --rm -p 8090:8090 healthz
```

## Dependencies

- **PyYAML** (`pyyaml>=6.0,<7.0`) — config file parsing.
- Python stdlib only for everything else (no frameworks).
