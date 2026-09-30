# Nahol Dental Care — API image
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# --ignore-scripts: the postinstall hook (prisma/setup.js) is not copied in yet
# and there is no MongoDB during the build.
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts
COPY . .
RUN mkdir -p /app/uploads

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build /app /app
RUN mkdir -p /app/uploads
EXPOSE 5000
CMD ["node", "src/server.js"]