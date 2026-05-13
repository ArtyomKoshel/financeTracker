# Railway Deployment Guide

## Architecture

| Railway Service | Dockerfile       | Role                                      |
|-----------------|------------------|-------------------------------------------|
| `api`           | `Dockerfile.api` | nginx + php-fpm + Laravel (main app)      |
| `worker`        | `Dockerfile.worker` | Reverb WebSocket + Scheduler + Telegram |
| `postgres`      | Railway Plugin   | PostgreSQL 16                             |
| `redis`         | Railway Plugin   | Redis 7                                   |

## Step-by-step Setup

### 1. Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Connect your GitHub repo

### 2. Add PostgreSQL plugin

In the project dashboard → **+ New** → **Database** → **PostgreSQL**

### 3. Add Redis plugin

In the project dashboard → **+ New** → **Database** → **Redis**

### 4. Create `api` service

- **+ New** → **GitHub Repo** → select this repo
- In service settings → **Build** → set **Dockerfile Path**: `Dockerfile.api`
- **Build Context** stays as root `/`
- Set the environment variables below

### 5. Create `worker` service

- **+ New** → **GitHub Repo** → select this repo again (same repo, different service)
- In service settings → **Build** → set **Dockerfile Path**: `Dockerfile.worker`
- Set the environment variables below (same set, minus the REVERB_SERVER_* vars)
- Set **Networking** → no public port (internal only, unless you want a direct WS URL)

---

## Environment Variables

### `api` service

```env
# App
APP_NAME=Finance Tracker
APP_ENV=production
APP_DEBUG=false
APP_KEY=                          # Generate: php artisan key:generate --show
APP_URL=https://<your-api-domain>.railway.app

# Database — reference Railway PostgreSQL plugin
DB_CONNECTION=pgsql
DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_DATABASE=${{Postgres.PGDATABASE}}
DB_USERNAME=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}

# Redis — reference Railway Redis plugin
REDIS_HOST=${{Redis.REDISHOST}}
REDIS_PORT=${{Redis.REDISPORT}}
REDIS_PASSWORD=${{Redis.REDISPASSWORD}}
CACHE_DRIVER=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis

# Reverb (Laravel Echo / WebSocket)
BROADCAST_DRIVER=reverb
REVERB_APP_ID=app-id
REVERB_APP_KEY=app-key
REVERB_APP_SECRET=app-secret
REVERB_HOST=${{worker.RAILWAY_PRIVATE_DOMAIN}}
REVERB_PORT=8080
REVERB_SCHEME=http

# Nginx → WebSocket proxy target (internal Railway hostname)
REVERB_SERVER_HOST=${{worker.RAILWAY_PRIVATE_DOMAIN}}
REVERB_SERVER_PORT=8080

# Logging
LOG_CHANNEL=stderr
LOG_LEVEL=warning

# Keys
JWT_SECRET=<generate a random 64-char string>
GROQ_API_KEY=<your key>
TELEGRAM_BOT_TOKEN=<your token>
VAPID_PUBLIC_KEY=<your key>
VAPID_PRIVATE_KEY=<your key>
```

### `worker` service

Same as `api`, but **without** `REVERB_SERVER_HOST` / `REVERB_SERVER_PORT`.

Add:
```env
REVERB_SERVER_HOST=0.0.0.0
REVERB_SERVER_PORT=8080
```

And expose port **8080** internally in the worker service settings.

---

## After First Deploy

1. The entrypoint auto-runs `php artisan migrate --force` on every deploy.
2. To generate VAPID keys: run in Railway's shell for the `api` service:
   ```
   php artisan webpush:vapid
   ```
3. To regenerate `APP_KEY` (one-time):
   ```
   php artisan key:generate --show
   ```
   Copy the output to the `APP_KEY` env var in Railway.
