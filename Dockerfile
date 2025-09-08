# Dockerfile
FROM node:24-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy app
COPY . .

EXPOSE 80

ENV NODE_ENV=production
CMD ["node", "app.mjs"]
