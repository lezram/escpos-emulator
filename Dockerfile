FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm ci --omit=dev --ignore-scripts

FROM gcr.io/distroless/nodejs24-debian13
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist/ ./dist/
COPY --from=build /app/node_modules/ ./node_modules/
COPY --from=build /app/package.json ./
EXPOSE 9100 3000
CMD ["dist/index.js"]
