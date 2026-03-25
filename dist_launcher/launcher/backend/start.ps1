# Set PostgreSQL connection environment variables
$env:POSTGRES_PASSWORD="Admin@123"
$env:DB_PORT="5433"
$env:DB_HOST="127.0.0.1"
$env:POSTGRES_DB="Dynamic_DB_Hercules"
$env:POSTGRES_USER="postgres"

Write-Host "✅ Environment variables set:" -ForegroundColor Green
Write-Host "   POSTGRES_PASSWORD: Admin@123" -ForegroundColor Cyan
Write-Host "   DB_PORT: 5433" -ForegroundColor Cyan
Write-Host "   DB_HOST: 127.0.0.1" -ForegroundColor Cyan
Write-Host ""
Write-Host "🚀 Starting Flask backend server..." -ForegroundColor Yellow
Write-Host ""

# Start the Flask application
python app.py

