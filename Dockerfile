# Arguments
ARG NODE_VERSION=18.20.4-alpine

# Build Image
FROM node:${NODE_VERSION} AS builder

WORKDIR /opt/app

RUN apk --no-cache add git
RUN apk add --no-cache -t build-dependencies make gcc g++ python3 py3-setuptools libtool openssl-dev autoconf automake bash \
    && cd $(npm root -g)/npm \
    && npm install -g node-gyp

COPY package.json package-lock.json* /opt/app/

RUN npm ci
RUN npm prune --omit=dev

FROM node:${NODE_VERSION}
WORKDIR /opt/app

RUN apk --no-cache add openjdk11-jre
# Create empty log file & link stdout to the application log file
RUN mkdir ./logs && touch ./logs/combined.log
RUN ln -sf /dev/stdout ./logs/combined.log

# Create a non-root user: e2e-user
RUN addgroup -g 1001 e2e-group && adduser -D -u 1001 -G e2e-group e2e-user
USER e2e-user

COPY --chown=e2e-user --from=builder /opt/app .

COPY src /opt/app/src
COPY assets /opt/app/assets
COPY ttk-test-collection /opt/app/ttk-test-collection

CMD ["npm", "run", "start"]
