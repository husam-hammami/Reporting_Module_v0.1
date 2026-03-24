@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo   Hercules Reporting Module — Desktop App Build Pipeline
echo ============================================================
echo.

:: Check prerequisites
where node >nul 2>nul || (echo ERROR: Node.js not found in PATH && exit /b 1)
where python >nul 2>nul || (echo ERROR: Python not found in PATH && exit /b 1)

set ROOT=%~dp0
cd /d "%ROOT%"

echo [1/5] Building frontend with desktop environment...
echo ---------------------------------------------------
cd Frontend
if not exist node_modules (
    echo   Installing npm dependencies...
    call npm install
)
copy /Y .env.desktop .env.production.local >nul
call npm run build
if errorlevel 1 (echo ERROR: Frontend build failed && exit /b 1)
cd /d "%ROOT%"
echo   Frontend built successfully.
echo.

echo [2/5] Copying frontend build to backend...
echo -------------------------------------------
if exist backend\frontend\dist rmdir /s /q backend\frontend\dist
xcopy /E /Y /I Frontend\dist backend\frontend\dist >nul
echo   Copied to backend\frontend\dist\
echo.

echo [3/5] Running database migration (add license machine info)...
echo ---------------------------------------------------------------
cd backend
python -c "import psycopg2; print('psycopg2 OK')" 2>nul || echo   WARNING: psycopg2 not installed — migration will run on first install
cd /d "%ROOT%"
echo   Migration SQL file ready at backend\migrations\add_license_machine_info.sql
echo.

echo [4/5] Building Python backend with PyInstaller...
echo ---------------------------------------------------
cd backend
python -m PyInstaller hercules.spec --noconfirm
if errorlevel 1 (echo ERROR: PyInstaller build failed && exit /b 1)
cd /d "%ROOT%"
echo   Backend frozen to backend\dist\hercules-backend\
echo.

echo [5/5] Building Electron installer...
echo --------------------------------------
cd desktop
if not exist node_modules (
    echo   Installing Electron dependencies...
    call npm install
)
call npm run build
if errorlevel 1 (echo ERROR: Electron build failed && exit /b 1)
cd /d "%ROOT%"
echo   Installer created in desktop\dist\
echo.

echo ============================================================
echo   BUILD COMPLETE
echo ============================================================
echo.
echo   Installer: desktop\dist\Hercules Reporting Module Setup *.exe
echo.
echo   Before distributing:
echo     1. Test on a clean Windows VM (no dev tools installed)
echo     2. Place pgsql\ portable PostgreSQL in desktop\pgsql\
echo     3. Place vc_redist.x64.exe in desktop\vcredist\
echo     4. Consider code signing with an EV certificate
echo.
