@echo off
echo ========================================
echo   Building Finance Tracker
echo ========================================
echo.

cd /d "%~dp0"

:: Скачиваем зависимости
echo [INFO] Downloading dependencies...
go mod tidy

:: Собираем для Windows
echo [INFO] Building for Windows...
set CGO_ENABLED=1
go build -o finance-tracker.exe .

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [SUCCESS] Build complete!
    echo Run: finance-tracker.exe
) else (
    echo.
    echo [ERROR] Build failed!
)

pause
