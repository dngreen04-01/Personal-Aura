FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Shared lib files required by server via require('../../lib/...').
# With WORKDIR=/app, that resolves to /lib/*.js.
COPY lib/constants.js /lib/constants.js
COPY lib/validateBlockPlan.js /lib/validateBlockPlan.js
COPY lib/calculateWorkoutDuration.js /lib/calculateWorkoutDuration.js
COPY lib/incrementUtils.js /lib/incrementUtils.js

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "index.js"]
