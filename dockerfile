# Étape 1 : Utiliser une image Node officielle
FROM node:20-bullseye

# Étape 2 : Installer les dépendances système nécessaires pour Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libxkbcommon0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Étape 3 : Définir le dossier de travail
WORKDIR /app

# Étape 4 : Copier package.json et package-lock.json pour installer les dépendances
COPY package*.json ./

# Étape 5 : Installer les dépendances Node
RUN npm install

# Étape 6 : Copier tout le code du backend
COPY . .

# Étape 7 : Exposer le port (celui utilisé dans ton backend)
EXPOSE 10000

# Étape 8 : Définir le chemin de Chromium pour Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Étape 9 : Commande pour démarrer ton backend
CMD ["npm", "start"]
