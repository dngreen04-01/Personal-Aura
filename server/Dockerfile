FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Shared constants required by server agents via require('../../lib/constants').
# With WORKDIR=/app, that resolves to /lib/constants.js.
# The file is copied into server/lib/ before deploy (see deploy instructions).
COPY lib/constants.js /lib/constants.js

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "index.js"]
