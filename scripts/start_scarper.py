"""One-click launcher: start Scarper backend + frontend in separate terminals."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path


def project_root() -> Path:
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        return exe_dir.parent if exe_dir.name == "dist" else exe_dir
    return Path(__file__).resolve().parent.parent


def require_cmd(name: str) -> str:
    path = shutil.which(name)
    if not path:
        print(f"错误：未找到 {name}，请先安装并加入 PATH。")
        input("按 Enter 退出…")
        sys.exit(1)
    return path


def main() -> None:
    root = project_root()
    os.chdir(root)

    python = require_cmd("python")
    npm = require_cmd("npm")

    env_file = root / ".env"
    if not env_file.is_file():
        example = root / ".env.example"
        print(f"警告：未找到 .env，请复制 {example.name} 为 .env 并填写配置。")

    node_modules = root / "node_modules"
    if not node_modules.is_dir():
        print("首次运行：正在安装前端依赖 (npm install)…")
        subprocess.run([npm, "install"], cwd=root, check=True)

    backend_cmd = f'cd /d "{root / "backend"}" && "{python}" run_dev.py'
    frontend_cmd = f'cd /d "{root}" && "{npm}" run dev'

    subprocess.Popen(
        ["cmd", "/c", "start", "Scarper Backend", "cmd", "/k", backend_cmd],
        cwd=root,
        shell=False,
    )
    time.sleep(1.5)
    subprocess.Popen(
        ["cmd", "/c", "start", "Scarper Frontend", "cmd", "/k", frontend_cmd],
        cwd=root,
        shell=False,
    )

    print("已启动：")
    print("  后端  http://127.0.0.1:8000")
    print("  前端  http://127.0.0.1:5173")
    print("正在打开浏览器…")
    time.sleep(2)
    webbrowser.open("http://127.0.0.1:5173")

    input("\n按 Enter 关闭此窗口（前后端窗口会继续运行）…")


if __name__ == "__main__":
    main()
