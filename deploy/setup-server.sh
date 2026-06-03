#!/usr/bin/env bash
# 在香港 VPS 上首次安装 Docker 并启动 Scarper
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "请用 root 运行: sudo bash deploy/setup-server.sh"
  exit 1
fi

echo "==> 安装 Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if ! docker compose version >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y docker-compose-plugin
fi

echo "==> 检查 .env..."
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "未找到 .env，从 deploy/.env.production.example 复制..."
  cp deploy/.env.production.example .env
  echo "请编辑 $ROOT/.env 填入密钥后重新运行: bash deploy/deploy.sh"
  exit 1
fi

bash deploy/deploy.sh
