# Use a lightweight Python image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy dependency file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend code into the container
COPY . .

# Expose the port the app runs on (Flask will run on 5000)
EXPOSE 5000

# Start the app using Gunicorn in production mode.
# Adjust "app:app" if your Flask app is named differently.
CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app", "--workers=3", "--timeout=120"]

