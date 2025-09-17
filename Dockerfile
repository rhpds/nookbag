FROM registry.access.redhat.com/ubi10/nodejs-22-minimal:10.0 AS builder
USER root
WORKDIR /build
ARG NODE_ENV="production"
ENV NODE_ENV=${NODE_ENV}

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY ./ ./
RUN npm run build

FROM registry.access.redhat.com/ubi10/httpd-24:10.0

COPY --from=builder /build/dist /var/www/html/