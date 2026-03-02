"""
Nookbag health check sidecar.

Exposes two endpoints routed via Traefik:

  /healthz  - Liveness probe.  Always returns 200.
  /readyz   - Readiness probe.  Fetches the ui-config from the nookbag
              service, resolves every tab URL, and probes each one.
              Returns 200 when everything is reachable, 503 when degraded.
"""

import json
import os
import signal
import ssl
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.error import URLError
from urllib.parse import urlparse

import yaml


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _env_int(name: str, default: str) -> int:
    raw = os.environ.get(name, default)
    try:
        return int(raw)
    except ValueError:
        raise SystemExit(f"Invalid value for {name}: {raw!r} (expected integer)")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LISTEN_PORT = _env_int("HEALTHZ_PORT", "8090")

# Base URL used to fetch the config and resolve relative tab paths.
# In compose this goes through Traefik so the check validates the full chain.
BASE_URL = os.environ.get("HEALTHZ_BASE_URL", "http://traefik:80")

# Nookbag serves config files under /nookbag/ (Vite base path).
NOOKBAG_BASE = os.environ.get("NOOKBAG_BASE", "/nookbag")

CONFIG_FILES = ["ui-config.yml", "zero-touch-config.yml"]

PROBE_TIMEOUT = _env_int("HEALTHZ_PROBE_TIMEOUT", "5")

# Maximum number of concurrent probe requests.
PROBE_WORKERS = _env_int("HEALTHZ_PROBE_WORKERS", "8")

MAX_CONFIG_SIZE = 1024 * 1024  # 1 MiB

CACHE_TTL = float(os.environ.get("HEALTHZ_CACHE_TTL", "5"))

# Many sites block the default Python-urllib User-Agent.
NOOKBAG_VERSION = os.environ.get("NOOKBAG_VERSION", "0.0.1")
USER_AGENT = f"rhdp-showroom/{NOOKBAG_VERSION}"

LOG = logging.getLogger("healthz")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

# Accept self-signed certs when probing internal services.
_insecure_ctx = ssl.create_default_context()
_insecure_ctx.check_hostname = False
_insecure_ctx.verify_mode = ssl.CERT_NONE

# ---------------------------------------------------------------------------
# Tab type -> default path / port mapping
# Kept in sync with nookbag/src/app.tsx  createUrlsFromVars()
# ---------------------------------------------------------------------------

TAB_TYPE_DEFAULTS: dict[str, dict[str, str]] = {
    "double-terminal": {
        "path": "/tty-top",
        "port": "443",
        "secondary_path": "/tty-bottom",
        "secondary_port": "443",
    },
    "terminal": {"path": "/tty1", "port": "443"},
    "secondary-terminal": {"path": "/tty2", "port": "443"},
    "codeserver": {"path": "/", "port": "8443"},
    "parasol": {"path": "/", "port": "8005"},
}


def apply_tab_defaults(tab: dict) -> dict:
    """Return a copy of *tab* with type-specific defaults applied."""
    tab = dict(tab)
    defaults = TAB_TYPE_DEFAULTS.get(tab.get("type", ""), {})
    for key, value in defaults.items():
        tab.setdefault(key, value)
    return tab


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def to_absolute_url(raw: str) -> str | None:
    """Resolve a possibly-relative URL against BASE_URL."""
    if not raw:
        return None
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    if raw.startswith("/"):
        return f"{BASE_URL}{raw}"
    return None


def resolve_tab_urls(tab: dict) -> list[tuple[str, str | None]]:
    """Return a list of (label, url) pairs for a tab config entry."""
    t = apply_tab_defaults(tab)
    results: list[tuple[str, str | None]] = []

    # Primary URL
    url: str | None = None
    if t.get("url"):
        url = to_absolute_url(t["url"])
    elif t.get("port"):
        proto = "https" if t["port"] in ("443", "8443") else "http"
        url = f"{proto}://localhost:{t['port']}{t.get('path', '')}"
    results.append((t.get("name", "unnamed"), url))

    # Secondary URL
    sec_url: str | None = None
    if t.get("secondary_url"):
        sec_url = to_absolute_url(t["secondary_url"])
    elif t.get("secondary_path") and (t.get("secondary_port") or t.get("port")):
        port = t.get("secondary_port") or t["port"]
        proto = "https" if port in ("443", "8443") else "http"
        sec_url = f"{proto}://localhost:{port}{t['secondary_path']}"
    if sec_url:
        label = f"{t.get('name', 'unnamed')} ({t.get('secondary_name', 'secondary')})"
        results.append((label, sec_url))

    return results


# ---------------------------------------------------------------------------
# Probing
# ---------------------------------------------------------------------------

def probe_url(url: str) -> dict:
    """Probe a URL with HEAD, falling back to GET on 405 Method Not Allowed."""
    ctx = _insecure_ctx if url.startswith("https") else None
    for method in ("HEAD", "GET"):
        try:
            req = Request(url, method=method, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=PROBE_TIMEOUT, context=ctx) as resp:
                code = resp.getcode()
                if code == 405 and method == "HEAD":
                    continue
                return {"reachable": 200 <= code < 400, "statusCode": code}
        except URLError as exc:
            reason = str(getattr(exc, "reason", exc))
            if "405" in reason and method == "HEAD":
                continue
            return {"reachable": False, "error": reason}
        except Exception as exc:
            return {"reachable": False, "error": str(exc)}
    return {"reachable": False, "error": "all probe methods failed"}


def fetch_config() -> tuple[dict | None, str | None]:
    """Fetch and parse the first available config file from nookbag."""
    for filename in CONFIG_FILES:
        url = f"{BASE_URL}{NOOKBAG_BASE}/{filename}"
        try:
            req = Request(url, method="GET", headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=PROBE_TIMEOUT) as resp:
                if resp.getcode() == 200:
                    data = resp.read(MAX_CONFIG_SIZE + 1)
                    if len(data) > MAX_CONFIG_SIZE:
                        LOG.warning("config %s exceeds %d byte limit", filename, MAX_CONFIG_SIZE)
                        continue
                    config = yaml.safe_load(data.decode("utf-8"))
                    if isinstance(config, dict):
                        return config, filename
        except Exception as exc:
            LOG.warning("failed to fetch config %s: %s", filename, exc)
            continue
    return None, None


def _probe_tab_entry(label: str, url: str | None) -> dict:
    """Probe a single tab entry and return the result dict."""
    if url:
        result = probe_url(url)
        result["name"] = label
        result["url"] = url
    else:
        result = {
            "name": label,
            "url": None,
            "reachable": False,
            "error": "no url configured",
        }
    return result


_cache_lock = threading.Lock()
_cached_result: tuple[int, dict] | None = None
_cached_at: float = 0.0


def check_readiness() -> tuple[int, dict]:
    """Return cached readiness result, refreshing when the TTL expires."""
    global _cached_result, _cached_at
    now = time.monotonic()
    with _cache_lock:
        if _cached_result is not None and (now - _cached_at) < CACHE_TTL:
            return _cached_result
    result = _check_readiness_impl()
    with _cache_lock:
        _cached_result = result
        _cached_at = time.monotonic()
    return result


def _check_readiness_impl() -> tuple[int, dict]:
    """Run all readiness checks and return (status_code, body)."""
    config, config_file = fetch_config()

    if config is None:
        return 503, {
            "status": "degraded",
            "service": "nookbag",
            "config": {"reachable": False, "error": "no config file found"},
            "tabs": [],
        }

    # Probe nookbag content (fetch index page through Traefik)
    antora = config.get("antora", {}) or {}
    is_showroom = config.get("type") == "showroom"
    content_dir = antora.get("dir") or ("www" if is_showroom else "antora")
    content_name = antora.get("name") or "modules"
    version = antora.get("version")

    segments = [content_dir, content_name]
    if version:
        segments.append(version)
    content_path = "/".join(segments)
    content_url = f"{BASE_URL}{NOOKBAG_BASE}/{content_path}/index.html"
    content_result = probe_url(content_url)
    content_result["path"] = content_path
    content_result["url"] = content_url

    # Collect all (label, url) pairs to probe
    tabs = config.get("tabs", []) or []
    entries: list[tuple[str, str | None]] = []
    for tab in tabs:
        entries.extend(resolve_tab_urls(tab))

    # Probe tabs in parallel
    tab_results: list[dict] = []
    with ThreadPoolExecutor(max_workers=PROBE_WORKERS) as pool:
        futures = {
            pool.submit(_probe_tab_entry, label, url): idx
            for idx, (label, url) in enumerate(entries)
        }
        ordered: dict[int, dict] = {}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                ordered[idx] = future.result()
            except Exception as exc:
                label, url = entries[idx]
                ordered[idx] = {
                    "name": label,
                    "url": url,
                    "reachable": False,
                    "error": f"probe exception: {exc}",
                }
        tab_results = [ordered[i] for i in sorted(ordered)]

    all_healthy = (
        content_result.get("reachable", False)
        and (len(tab_results) == 0 or all(t.get("reachable") for t in tab_results))
    )

    status_code = 200 if all_healthy else 503
    body = {
        "status": "ok" if all_healthy else "degraded",
        "service": "nookbag",
        "configFile": config_file,
        "content": content_result,
        "tabs": tab_results,
    }
    return status_code, body


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/healthz":
            self._json_response(200, {"status": "ok", "service": "nookbag-healthz"})
        elif path == "/readyz":
            code, body = check_readiness()
            self._json_response(code, body)
        else:
            self._json_response(404, {"error": "not found"})

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path == "/healthz":
            self._head_response(200)
        elif path == "/readyz":
            code, _ = check_readiness()
            self._head_response(code)
        else:
            self._head_response(404)

    def _json_response(self, code: int, body: dict):
        payload = json.dumps(body, indent=2).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _head_response(self, code: int):
        """Send headers only, no body (RFC 9110 HEAD semantics)."""
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()

    def log_message(self, format, *args):
        LOG.info(format, *args)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    server = ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), HealthHandler)
    server.daemon_threads = True

    # Handle SIGTERM for graceful container shutdown (orchestrators send
    # SIGTERM, not SIGINT).  shutdown() must be called from a thread other
    # than the one running serve_forever().
    def _shutdown(signum, _frame):
        LOG.info("received signal %s, shutting down", signum)
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _shutdown)

    LOG.info("healthz listening on :%d", LISTEN_PORT)
    LOG.info("base_url=%s  nookbag_base=%s", BASE_URL, NOOKBAG_BASE)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOG.info("interrupted")
    finally:
        server.server_close()
        LOG.info("server closed")


if __name__ == "__main__":
    main()
