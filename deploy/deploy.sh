#!/usr/bin/env bash
# 构建并启动（在仓库根目录执行）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "错误: 缺少 $ROOT/.env"
  echo "执行: cp deploy/.env.production.example .env && nano .env"
  exit 1
fi

# 加载前端构建参数
set -a
# shellcheck disable=SC1091
source .env
set +a

echo "==> 构建并启动 Docker Compose..."
docker compose -f deploy/docker-compose.yml up -d --build

echo ""
echo "==> 等待后端就绪..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1/api/health >/dev/null 2>&1; then
    echo "OK: /api/health"
    break
  fi
  sleep 2
  if [[ "$i" -eq 30 ]]; then
    echo "警告: health 检查超时，查看日志: docker compose -f deploy/docker-compose.yml logs -f"
    exit 1
  fi
done

echo ""
echo "部署完成。浏览器访问: http://$(curl -s ifconfig.me 2>/dev/null || echo '你的公网IP')"
echo "查看日志: docker compose -f deploy/docker-compose.yml logs -f"
