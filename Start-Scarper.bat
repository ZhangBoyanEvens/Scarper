@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo 错误：未找到 python，请先安装 Python 并加入 PATH。
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo 错误：未找到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

if not exist ".env" (
  echo 警告：未找到 .env，请复制 .env.example 为 .env 并填写配置。
)

if not exist "node_modules\" (
  echo 首次运行：正在安装前端依赖...
  call npm install
  if errorlevel 1 (
    echo npm install 失败。
    pause
    exit /b 1
  )
)

start "Scarper Backend" cmd /k "cd /d "%~dp0backend" && python run_dev.py"
timeout /t 2 /nobreak >nul
start "Scarper Frontend" cmd /k "cd /d "%~dp0" && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"

echo.
echo 已启动前后端：
echo   后端  http://127.0.0.1:8000
echo   前端  http://127.0.0.1:5173
echo.
echo 关闭对应命令行窗口即可停止服务。
pause
