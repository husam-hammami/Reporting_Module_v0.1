@echo off
setlocal
echo ============================================
echo  Hercules Desktop App - Build Pipeline
echo ============================================
echo.

echo [1/4] Building frontend...
cd Frontend
if exist .env.production.local del .env.production.local
copy .env.desktop .env.production.local
call npm install
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Frontend build failed!
    exit /b 1
)
cd ..

echo.
echo [2/4] Copying frontend to backend...
if exist backend\frontend\dist rmdir /S /Q backend\frontend\dist
xcopy /E /Y /I Frontend\dist backend\frontend\dist
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to copy frontend!
    exit /b 1
)

echo.
echo [3/4] Building Python backend with PyInstaller...
cd backend
pip install pyinstaller
python -m PyInstaller hercules.spec --noconfirm
if %ERRORLEVEL% neq 0 (
    echo ERROR: PyInstaller build failed!
    exit /b 1
)
cd ..

echo.
echo [4/4] Building Electron installer...
cd desktop
call npm install
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Electron build failed!
    exit /b 1
)
cd ..

echo.
echo ============================================
echo  BUILD COMPLETE
echo  Installer: desktop\dist\
echo ============================================
