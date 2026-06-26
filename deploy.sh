#!/bin/bash
set -e

echo "=== Data2Dash Deployment Script ==="
echo ""

# ── 1. Install Docker if not present ─────────────────────────────────────
if ! command -v docker &> /dev/null; then
    echo "[1/5] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. Log out and back in, then re-run this script."
    exit 0
else
    echo "[1/5] Docker already installed."
fi

# ── 2. Install Docker Compose plugin if not present ──────────────────────
if ! docker compose version &> /dev/null; then
    echo "[2/5] Installing Docker Compose plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
else
    echo "[2/5] Docker Compose already installed."
fi

# ── 3. Clone or pull the repo ────────────────────────────────────────────
REPO_URL="https://github.com/Data2Dash/Data2Dash-FullStack.git"
APP_DIR="$HOME/data2dash"

if [ -d "$APP_DIR" ]; then
    echo "[3/5] Updating existing repo..."
    cd "$APP_DIR" && git pull origin main
else
    echo "[3/5] Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# ── 4. Set up environment file ───────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
    echo "[4/5] Creating .env from template..."
    cp .env.production .env
    echo ""
    echo "  !! IMPORTANT: Edit $APP_DIR/.env with your actual values:"
    echo "     - DB_PASSWORD"
    echo "     - GROQ_API_KEY"
    echo "     - JWT_SECRET_KEY (run: python3 -c \"import secrets; print(secrets.token_hex(32))\")"
    echo "     - FRONTEND_URL (your domain)"
    echo ""
    echo "  Then re-run this script."
    exit 0
else
    echo "[4/5] .env file exists."
fi

# ── 5. Build and start ───────────────────────────────────────────────────
echo "[5/5] Building and starting containers..."
cd "$APP_DIR"
docker compose up -d --build

echo ""
echo "=== Deployment complete ==="
echo ""
docker compose ps
echo ""
echo "  Frontend: http://$(hostname -I | awk '{print $1}')"
echo "  Backend:  http://$(hostname -I | awk '{print $1}')/api/"
echo ""
echo "  Logs:     docker compose logs -f"
echo "  Stop:     docker compose down"
echo "  Restart:  docker compose restart"
