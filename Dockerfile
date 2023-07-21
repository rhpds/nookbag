FROM registry.access.redhat.com/ubi8/nodejs-16-minimal:latest AS builder
USER root 
ARG NODE_ENV="production"
ENV NODE_ENV=${NODE_ENV}

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force
COPY ./ ./
RUN npm run build-antora
RUN npm run build

FROM registry.access.redhat.com/rhscl/httpd-24-rhel7

COPY --from=builder /dist /var/www/html/