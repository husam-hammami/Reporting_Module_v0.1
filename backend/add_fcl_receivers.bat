@echo off
REM Add fcl_receivers column to FCL tables
echo ========================================
echo Add FCL Receivers Column
echo ========================================
echo.

python add_fcl_receivers.py

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Column added successfully!
    echo ========================================
    echo.
    echo Please restart your backend now.
    pause
) else (
    echo.
    echo ========================================
    echo Failed! Check errors above.
    echo ========================================
    pause
    exit /b 1
)

