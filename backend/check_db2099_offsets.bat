@echo off
REM Check DB2099 offsets to find correct FCL 2_520WE location
echo ========================================
echo DB2099 Offset Diagnostic Tool
echo ========================================
echo.
echo This will scan DB2099 to find the correct offset for FCL 2_520WE
echo.

python check_db2099_offsets.py

echo.
pause

