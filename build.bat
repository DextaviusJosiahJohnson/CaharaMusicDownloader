@echo off
title CMD Build Script
echo.
echo  ============================================
echo   CMD - Cahara Music Downloader - Builder
echo  ============================================
echo.

:: Check Node is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Check npm is installed
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [FAIL] npm not found. Reinstall Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo [INFO] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [FAIL] npm install failed.
    pause
    exit /b 1
)

echo.
echo [INFO] Building portable exe...
call npm run build
if %errorlevel% neq 0 (
    echo [FAIL] Build failed. See output above.
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   [OK] Build complete! Check the dist\ folder
echo  ============================================
echo.
pause
