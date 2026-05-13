#!/bin/sh
set -e

cd /var/www/html

# ----------------------------------------------------------------
# 1. Generate .env from environment variables if it doesn't exist
# ----------------------------------------------------------------
if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || touch .env
fi

if [ -z "${APP_KEY}" ]; then
    php artisan key:generate --force --no-interaction
fi

# ----------------------------------------------------------------
# 2. Clear config cache and re-cache
# ----------------------------------------------------------------
php artisan config:clear --no-interaction 2>/dev/null || true
php artisan config:cache --no-interaction 2>/dev/null || true

# ----------------------------------------------------------------
# 3. Ensure storage permissions
# ----------------------------------------------------------------
mkdir -p storage/framework/{cache/data,sessions,views} storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

echo "Worker entrypoint complete, starting supervisord..."
exec "$@"
