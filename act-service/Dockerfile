# Nova Act service - uses official Playwright image (Chromium pre-installed)
FROM mcr.microsoft.com/playwright/python:v1.49.0-noble

WORKDIR /app
COPY act-service/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY act-service/app.py app.py
COPY scripts/ scripts/

ENV PORT=5000
EXPOSE 5000
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --timeout 600 app:app"]
