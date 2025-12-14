FROM python:3.11-slim

WORKDIR /app

# Copy shared requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared module
COPY shared /app/shared

# Copy service-specific code
COPY services/auth-service/app /app/app

ENV PYTHONPATH=/app

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
