# Dockerfile
FROM node:18-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy app
COPY . .

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "app.js"]
