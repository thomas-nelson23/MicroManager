# nextion-arduino: one image with the API server, the built web UI, arduino-cli and the Nextion
# build tools. Claude Code comes from the Agent SDK's bundled binary.

# ---- build the web UI ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/flasher/package.json packages/flasher/
COPY packages/flash-test/package.json packages/flash-test/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci --ignore-scripts
COPY packages ./packages
RUN npm run build -w @nextion-arduino/web

# ---- runtime ----
FROM node:22-bookworm-slim
ARG ARDUINO_CLI_VERSION=1.5.1
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 openssh-client ca-certificates curl tar tini \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" | tar -xz -C /usr/local/bin arduino-cli \
 && arduino-cli version

# Board cores are baked into the image; libraries Claude installs go to /data (persistent).
ENV ARDUINO_DIRECTORIES_DATA=/opt/arduino \
    ARDUINO_DIRECTORIES_DOWNLOADS=/opt/arduino/staging \
    ARDUINO_DIRECTORIES_USER=/data/arduino
RUN arduino-cli core update-index \
 && arduino-cli core install arduino:megaavr arduino:avr \
 && rm -rf /opt/arduino/staging

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages ./packages
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/packages/server/nextion/nxbuild.sh

ENV NODE_ENV=production \
    PORT=8765 \
    DATA_DIR=/data \
    WEB_DIST=/app/packages/web/dist \
    HOME=/data/home \
    SSH_KEY=/data/home/.ssh/id_ed25519
VOLUME ["/data"]
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:8765/api/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "--import", "tsx", "packages/server/src/main.ts"]
