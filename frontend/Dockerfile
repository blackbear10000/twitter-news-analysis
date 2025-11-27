FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Use shell form to allow environment variable substitution
# Vite recognizes PORT env var, but we also pass it as --port flag
CMD npm run dev -- --host 0.0.0.0 --port ${PORT:-5173}

