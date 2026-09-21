# Nahol Dental Care — API image
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install
COPY . .

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build /app /app
RUN mkdir -p /app/uploads
EXPOSE 5000
# server.js connects to MongoDB and auto-seeds a fresh (empty) database
# with demo data on startup when SEED_ADMIN_PASSWORD is set.
CMD ["node", "src/server.js"]