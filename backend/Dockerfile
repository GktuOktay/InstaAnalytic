FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright browser (Plan B için)
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
    libdbus-1-3 libx11-xcb1 libxcb-dri3-0 libxshmfence1 \
    libgles2 libgl1 fonts-liberation \
    && rm -rf /var/lib/apt/lists/* \
    && playwright install chromium

COPY . .

EXPOSE 8000
