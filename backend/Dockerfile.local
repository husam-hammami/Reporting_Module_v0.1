# Use a lightweight Python image
FROM python:3.9-slim

# Install build deps and Cairo so pycairo (used by xhtml2pdf/reportlab) can compile
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libcairo2-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy dependency file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend code into the container
COPY . .

# Expose the port the app runs on (5001 to avoid conflict with other project on 5000)
EXPOSE 5001

# Run with Flask-SocketIO's eventlet server (avoids Gunicorn/eventlet ALREADY_HANDLED compatibility issue)
CMD ["python", "app.py"]

