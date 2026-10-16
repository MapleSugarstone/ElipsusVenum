@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node 22 or newer is required. Install it and run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
)
echo Building ElipsusVenum...
call npm run build --silent
if errorlevel 1 goto :fail
echo Opening http://localhost:8744/
echo Close this window to stop the game.
call npx vite preview --port 8744 --strictPort --open
goto :eof
:fail
echo The build failed. See the output above.
pause
exit /b 1
