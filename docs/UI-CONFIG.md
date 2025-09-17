## UI configuration (ui-config.yml)

This document describes the top-level `ui-config.yml` options and details for configuring tabs. Behavior is derived from the TypeScript types and the app’s config loading/rendering logic.

- Source of truth:
  - `nookbag/src/types.ts` (`TTab`, `TModule`)
  - `nookbag/src/app.tsx` (config parsing, URL construction, rendering)

## Configuration reference (ui-config.yml)

| Key | Type | Required / Default | Description |
| --- | --- | --- | --- |
| `type` | enum | — | `showroom`: documentation-only UI. `zero-touch`: enables lab progression controls and automation hooks. |
| `antora` | object | — | Controls documentation content shown in the left panel iframe. |
| `antora.name` | string | default: `modules` | Logical root for generated HTML paths. |
| `antora.dir` | string | default: `www` when `type: showroom`; otherwise `antora` | Directory used for iframe base path. |
| `antora.version` | string | — | Optional version segment included in iframe paths. |
| `antora.modules[]` | array (module objects) | — | Module order and metadata for the progress header. |
| `antora.modules[].name` | string | required | Module key/path segment used for navigation and progress tracking. |
| `antora.modules[].label` | string | optional | Human-friendly title shown in the progress header. |
| `antora.modules[].scripts` | array (enum) | optional | Any of `setup`, `validation`, `solve`; enables corresponding automation actions. |
| `antora.modules[].solveButton` | boolean | optional | Force-enable the Solve button for this module when true. |
| `tabs[]` | array (tab objects) | — | Declares the tabs shown in the app. |
| `tabs[].name` | string | required | Display label and internal key for the tab (must be unique). |
| `tabs[].url` | string | optional | Full URL to load; if present, overrides `port`/`path` for the primary view. |
| `tabs[].external` | boolean | optional (default: false) | If true, opens `url` in a new browser tab; otherwise embeds in an iframe. |
| `tabs[].port` | string or number | optional | Used to construct the URL when `url` is not provided. Final form: `<protocol>//<hostname>:<port><path>`. |
| `tabs[].path` | string | optional | Appended when using `port`. Examples: `/app`, `/wetty`, `/tty`, `/console`. |
| `tabs[].type` | enum | optional | Presets: `terminal` → `path: /tty1`, `port: 443`; `secondary-terminal` → `path: /tty2`, `port: 443`; `double-terminal` → `path: /tty-top`, `port: 443` and `secondary_path: /tty-bottom`, `secondary_port: 443`; `codeserver` → `path: /`, `port: 8443`; `parasol` → `path: /`, `port: 8005`. Overrides any provided `path`/`port`. |
| `tabs[].modules` | string[] | optional | Show the tab only when the current module name is in this list. |
| `tabs[].secondary_name` | string | optional | Label for the secondary (bottom) panel in split view. |
| `tabs[].secondary_url` | string | optional | Full URL for the secondary panel; enables a vertical split (primary + secondary). |
| `tabs[].secondary_port` | string or number | optional | Used to build `secondary_url` when `secondary_path` is set and `secondary_url` is not provided. |
| `tabs[].secondary_path` | string | optional | When set (and `secondary_url` is not set), constructs `<protocol>//<hostname>:<secondary_port><secondary_path>`. |

### Behavior notes

- If `url` is set, the primary content uses it directly; `port`/`path` are ignored for the primary view. Any provided `secondary_*` values are still honored.
- A refresh icon appears on the currently active embedded tab (when `external: false`) that does not have a `secondary_url`.
- Tabs that point to terminal paths (e.g., `/wetty`, `/tty*`) or use terminal-related `type`s get terminal-friendly styling in the iframe.
- If neither `url` nor `port` is defined for the primary view, the app throws an error: "Port and url not defined".
- The app builds URLs using the current page's `window.location.protocol` and `window.location.hostname`.

### Minimal examples

External link (opens new browser tab)

```yaml
# ui-config.yml

tabs:
  - name: Documentation
    url: https://docs.example.com
    external: true
```

Embedded internal service (constructed URL)

```yaml
# ui-config.yml

tabs:
  - name: Local Application
    port: 3000
    path: /app
    external: false
```

Split view with computed secondary URL

```yaml
# ui-config.yml

tabs:
  - name: Console + Logs
    port: 8080
    path: /console
    secondary_name: Logs
    secondary_port: 8081
    secondary_path: /logs
    external: false
```

Split view with explicit secondary_url

```yaml
# ui-config.yml

tabs:
  - name: Dashboard + Traces
    url: https://grafana.example.com/dash
    secondary_name: Traces
    secondary_url: https://jaeger.example.com/search
    external: false
```

Terminal presets via type

```yaml
# ui-config.yml

tabs:
  - name: Terminal
    type: terminal
    # Automatically becomes: port: 443, path: /tty1

  - name: Double Terminal
    type: double-terminal
    # Automatically becomes:
    #   port: 443, path: /tty-top
    #   secondary_port: 443, secondary_path: /tty-bottom
```

Show only for specific modules

```yaml
# ui-config.yml

tabs:
  - name: AAP
    url: https://control-${guid}.${domain}/
    modules:
      - module-01
      - module-03
    external: false
```
