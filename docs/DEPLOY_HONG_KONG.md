# Scarper 香港 VPS 部署指南

一步一步把 **前后端 + Playwright 全功能** 部署到香港轻量服务器。

**架构：**

```
浏览器 → Nginx:80（前端静态 + /api 反代）→ FastAPI + Playwright
                                              ↓
                                         Neon / Clerk / DeepSeek
```

**预计时间：** 购买服务器 10 分钟 + 部署 20–40 分钟（含 Docker 构建）

---

## 第 0 步：准备清单

开始前确认你有：

| 项目 | 说明 |
|------|------|
| DeepSeek API Key | [platform.deepseek.com](https://platform.deepseek.com) |
| Clerk 账号 | [dashboard.clerk.com](https://dashboard.clerk.com) |
| Neon 数据库 URL | 建议选 **新加坡** 区域（离香港近） |
| 域名（推荐） | 如 `app.example.com`，**香港服务器绑域名无需 ICP 备案** |
| GitHub 仓库访问 | 用于在服务器上 `git clone` |

---

## 第 1 步：购买香港轻量服务器

### 腾讯云（推荐）

1. 打开 [腾讯云轻量应用服务器](https://cloud.tencent.com/product/lighthouse)
2. **地域：中国香港**
3. **镜像：Ubuntu 22.04 LTS**
4. **配置：2核2G 起步**（预算够选 2核4G 更稳）
5. 设置 **root 密码**，记下公网 IP

### 阿里云（备选）

1. [阿里云轻量应用服务器](https://www.aliyun.com/product/swas)
2. 同样选 **香港 + Ubuntu 22.04 + 2核2G**

### 安全组 / 防火墙

放行端口：

| 端口 | 用途 |
|------|------|
| **22** | SSH |
| **80** | HTTP（网站 + API） |
| **443** | HTTPS（第 8 步可选） |

---

## 第 2 步：SSH 登录服务器

在你电脑上（PowerShell / Terminal）：

```bash
ssh root@你的公网IP
```

首次登录成功后：

```bash
apt update && apt upgrade -y
```

---

## 第 3 步：安装 Git 并拉取代码

```bash
apt install -y git

# 换成你的仓库地址
cd /opt
git clone https://github.com/ZhangBoyanEvens/Scarper.git
cd Scarper
```

若仓库是私有的，需配置 SSH Key 或 Personal Access Token。

---

## 第 4 步：配置环境变量

```bash
cp deploy/.env.production.example .env
nano .env
```

**必填项（逐项改）：**

```env
DEEPSEEK_API_KEY=sk-你的密钥

VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx
CLERK_JWT_ISSUER=https://xxx.clerk.accounts.dev

NEON_ENABLED=true
NEON_DATABASE_URL=postgresql://...
VITE_NEON_UPLOAD_ENABLED=true

CLERK_REQUIRE_AUTH=true
DAILY_EXTRACT_LIMIT=20

PLAYWRIGHT_ENABLED=true
PLAYWRIGHT_CONTEXT_POOL_SIZE=1

# 有域名时（推荐）
CORS_ORIGINS=https://app.你的域名.com

# 暂时只有 IP 时
CORS_ORIGINS=http://123.45.67.89
```

保存：`Ctrl+O` → 回车 → `Ctrl+X`

> **注意：** 生产环境 `VITE_BACKEND_URL` **不要填**。前后端同域，由 Nginx 把 `/api` 转发到后端。

---

## 第 5 步：配置 Clerk 域名

1. 登录 [Clerk Dashboard](https://dashboard.clerk.com)
2. 进入你的 Application → **Domains**
3. 添加你的访问地址：
   - 有域名：`https://app.你的域名.com`
   - 仅 IP 测试：Clerk 对纯 IP 支持有限，**强烈建议先绑一个域名**（Cloudflare / Namecheap 均可，指到香港 IP 即可，无需备案）

4. 确认 **JWT Issuer** 与 `.env` 里 `CLERK_JWT_ISSUER` 一致

---

## 第 6 步：一键部署

```bash
cd /opt/Scarper
chmod +x deploy/*.sh
sudo bash deploy/setup-server.sh
```

脚本会：

1. 安装 Docker
2. 构建后端镜像（含 Playwright + Chromium）
3. 构建前端镜像（Vite 打包 + Nginx）
4. 启动服务并检查 `/api/health`

**首次构建约 10–20 分钟**（下载镜像 + 安装 Python 依赖）。

---

## 第 7 步：验证

### 7.1 命令行检查

```bash
curl http://127.0.0.1/api/health
# 期望: {"status":"ok"}

docker compose -f deploy/docker-compose.yml ps
# 两个容器 backend / web 都应为 Up
```

### 7.2 浏览器检查

1. 打开 `http://你的公网IP` 或 `https://你的域名`
2. Homepage 登录（Clerk）
3. Settings → **连接测试**：Python 后端、Clerk、Neon 应为绿色
4. Tools → Scrape，测试一个 URL：
   - 静态页：`https://example.com`
   - SPA（验证 Playwright）：`https://stripe.com`

---

## 第 8 步：绑定域名 + HTTPS（推荐）

假设域名 `app.example.com` 已解析到香港服务器 IP。

### 8.1 安装 Certbot

```bash
apt install -y certbot
docker compose -f deploy/docker-compose.yml stop web
```

### 8.2 申请证书（standalone 模式）

```bash
certbot certonly --standalone -d app.example.com
```

### 8.3 启用 HTTPS 配置

```bash
cp deploy/nginx-ssl.conf.example deploy/nginx.conf
nano deploy/nginx.conf
# 把 app.example.com 改成你的域名
```

编辑 `docker-compose.yml` 中 web 服务的 ports：

```yaml
ports:
  - "80:80"
  - "443:443"
volumes:
  - /etc/letsencrypt:/etc/letsencrypt:ro
```

重新部署：

```bash
bash deploy/deploy.sh
```

更新 `.env`：

```env
CORS_ORIGINS=https://app.example.com
```

并在 Clerk Domains 里改为 `https://app.example.com`。

---

## 常用运维命令

```bash
cd /opt/Scarper

# 查看日志
docker compose -f deploy/docker-compose.yml logs -f

# 只看后端
docker compose -f deploy/docker-compose.yml logs -f backend

# 重启
docker compose -f deploy/docker-compose.yml restart

# 更新代码后重新部署
git pull
bash deploy/deploy.sh

# 停止
docker compose -f deploy/docker-compose.yml down
```

---

## 故障排查

| 现象 | 处理 |
|------|------|
| 构建 OOM  killed | 升级到 2核4G；或临时加 swap：`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Clerk 登录失败 | 检查 Domains 是否包含当前访问 URL；Issuer 是否与 `.env` 一致 |
| Neon 连接失败 | 确认 `NEON_DATABASE_URL` 正确；Neon 控制台允许外网连接 |
| SPA 抓取失败 | 看后端日志 `logs backend`；确认 `PLAYWRIGHT_ENABLED=true` |
| `/api/health` 502 | `docker compose logs backend`，常见为 `.env` 缺密钥或端口冲突 |
| 前端白屏 | 检查 `VITE_CLERK_PUBLISHABLE_KEY` 是否在构建时传入（改 `.env` 后需重新 `deploy.sh`） |

---

## 配置与 Render 的差异

| 项目 | Render 免费 | 香港 VPS |
|------|-------------|----------|
| Playwright | 需关闭 | ✅ 开启 |
| 内存 | 512MB | 2GB+ |
| 冷启动 | 有 | 无 |
| 年费 | ~600 元（Starter） | ~38–199 元 |

---

## 文件说明

| 文件 | 作用 |
|------|------|
| `deploy/Dockerfile.backend` | Python + Playwright 后端 |
| `deploy/Dockerfile.frontend` | Vite 构建 + Nginx |
| `deploy/docker-compose.yml` | 编排 backend + web |
| `deploy/nginx.conf` | 静态文件 + `/api` 反代 |
| `deploy/.env.production.example` | 生产环境变量模板 |
| `deploy/deploy.sh` | 构建并启动 |
| `deploy/setup-server.sh` | 首次安装 Docker + 部署 |

---

*部署完成后，你的 Scarper 与本地开发功能一致，Playwright 可正常抓取 SPA 页面。*
