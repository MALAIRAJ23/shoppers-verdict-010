@echo off
REM Shopper's Verdict - Startup Script
REM This script sets up the environment and runs the Flask application

echo.
echo =========================================
echo    Shopper's Verdict - AI Shopping App
echo =========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org
    pause
    exit /b 1
)

REM Check if venv exists, if not create it
if not exist "venv" (
    echo [INFO] Creating virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
)

REM Activate virtual environment
echo [INFO] Activating virtual environment...
call venv\Scripts\activate.bat
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate virtual environment
    pause
    exit /b 1
)

REM Install/Update dependencies
echo [INFO] Installing dependencies...
pip install --upgrade pip setuptools wheel >nul 2>&1
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

REM Run the Flask application
echo.
echo [SUCCESS] Environment setup complete!
echo [INFO] Starting Shopper's Verdict server...
echo.
echo =========================================
echo    The app will run at: http://localhost:5000
echo    Press Ctrl+C to stop the server
echo =========================================
echo.

python app.py

REM Deactivate virtual environment on exit
deactivate
pause
