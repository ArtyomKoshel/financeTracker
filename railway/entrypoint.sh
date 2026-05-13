#!/bin/sh
set -e

cd /var/www/html

# ----------------------------------------------------------------
# 1. Generate .env from environment variables if it doesn't exist
#    (Railway injects all env vars, but Laravel needs APP_KEY etc.)
# ----------------------------------------------------------------
if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || touch .env
fi

# Generate APP_KEY if not provided — Railway should set this env var
if [ -z "${APP_KEY}" ]; then
    php artisan key:generate --force --no-interaction
fi

# ----------------------------------------------------------------
# 2. Apply nginx config (substitute ${PORT}, ${REVERB_SERVER_HOST},
#    ${REVERB_SERVER_PORT} while preserving nginx $variables)
# ----------------------------------------------------------------
export PORT="${PORT:-8080}"
export REVERB_SERVER_HOST="${REVERB_SERVER_HOST:-worker.railway.internal}"
export REVERB_SERVER_PORT="${REVERB_SERVER_PORT:-8080}"

envsubst '${PORT}${REVERB_SERVER_HOST}${REVERB_SERVER_PORT}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/nginx.conf

# ----------------------------------------------------------------
# 3. Clear config cache and re-cache for production
# ----------------------------------------------------------------
php artisan config:clear --no-interaction 2>/dev/null || true
php artisan config:cache --no-interaction 2>/dev/null || true

# ----------------------------------------------------------------
# 4. Wait for database and run migrations (idempotent)
# ----------------------------------------------------------------
echo "Waiting for database..."
RETRIES=30
until php artisan db:show --no-interaction > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
    echo "  DB not ready, retrying in 2s... ($RETRIES retries left)"
    sleep 2
    RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
    echo "ERROR: Database is not reachable after 60s. Check DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE env vars."
    exit 1
fi

php artisan migrate --force --no-interaction

# ----------------------------------------------------------------
# 5. Cache routes and views for performance
# ----------------------------------------------------------------
php artisan route:cache --no-interaction 2>/dev/null || true
php artisan view:cache --no-interaction 2>/dev/null || true

# ----------------------------------------------------------------
# 6. Ensure storage permissions and symlink
# ----------------------------------------------------------------
mkdir -p storage/framework/{cache/data,sessions,views} storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache
php artisan storage:link --force --no-interaction 2>/dev/null || true

echo "API entrypoint complete, starting supervisord..."
exec "$@"
