# Nookbag

This repository stores the nookbag logic (progress bar, next button, etc) and produces a base docker image for the lab to be based on.

## Development:

Can extend the nookbag docker image as the following:
```
FROM docker.io/antora/antora as builder

ADD . .

RUN antora generate --stacktrace site.yml

FROM quay.io/rhpds/nookbag:latest

COPY --from=builder /antora/dist /var/www/html/antora
```

*The labs will mount the html output inside the `/var/www/html/antora` folder.

*The config file (defined in agnosticV) needs to be mounted in the path: `/var/www/html/nookbag.yml`.

The theme used is [nookbag-bundle](https://github.com/rhpds/nookbag-bundle)

## Dev server (hot reload):

- Run locally: `npm ci && npm run dev` (serves on `http://localhost:8080/nookbag/`).
- Or use the provided `Dockerfile.dev` (exposes port `8080`).
- When served behind Traefik, the app is available under `/nookbag/` and HMR is configured to work through the proxy.

## Validation messages:

- Validation output supports limited Markdown: links, inline code, bold, italics, and line breaks.
- Content is escaped first, and links open in a new tab with `rel="noopener noreferrer"`.

- Supported patterns:
  - Link: `[text](http://...|https://...)`
  - Inline code: ``code``
  - Bold: `**text**`
  - Italics: `*text*`
  - Line breaks: `\n` becomes a new line

- Example input:

```
Validation failed: see [guide](https://example.com/nookbag).
Check `kubectl get pods` output.
**Tip**: try *again* after fixing YAML.
```

## Config loading:

- The UI reads its configuration once at startup from `./ui-config.yml` (or `./zero-touch-config.yml` if present).

## Build:

- `npm run build` produces the static site in `dist/` (production behavior unchanged).
