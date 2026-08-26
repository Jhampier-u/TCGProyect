# syntax=docker/dockerfile:1
#
# Suite E2E (H8a). Sobre la imagen oficial de Playwright, que ya trae los
# navegadores y las dependencias de sistema que necesitan.
#
# La etiqueta DEBE coincidir con la version de @playwright/test en
# e2e/package-lock.json. Si divergen, Playwright busca navegadores que la imagen
# no tiene y falla al arrancar con un mensaje poco obvio.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY e2e/package.json e2e/package-lock.json ./
RUN npm ci

COPY e2e/playwright.config.ts ./
COPY e2e/src ./src

CMD ["npx", "playwright", "test"]
