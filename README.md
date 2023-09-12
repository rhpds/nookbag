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
