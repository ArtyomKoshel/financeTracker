#!/bin/sh
set -e

cd /var/www/html

# ----------------------------------------------------------------
# 1. Create .env if missing (Railway injects real values via env)
# ----------------------------------------------------------------
[ -f .env ] || touch .env

# ----------------------------------------------------------------
# 2. Generate nginx config
# ----------------------------------------------------------------
export PORT="${PORT:-8080}"
export REVERB_HOST="${REVERB_HOST:-worker.railway.internal}"
export REVERB_PORT="${REVERB_PORT:-8080}"
_NS=$(grep -m1 '^nameserver' /etc/resolv.conf | awk '{print $2}' 2>/dev/null || echo "8.8.8.8")
# nginx needs IPv6 addresses wrapped in brackets
if echo "$_NS" | grep -q ':'; then
    NGINX_RESOLVER="[$_NS]"
else
    NGINX_RESOLVER="$_NS"
fi

# Railway PostgreSQL plugin exposes PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.
# Map them to Laravel's DB_* when empty.
[ -z "$DB_HOST" ]     && [ -n "$PGHOST" ]     && export DB_HOST="$PGHOST"
[ -z "$DB_PORT" ]     && [ -n "$PGPORT" ]     && export DB_PORT="$PGPORT"
[ -z "$DB_DATABASE" ] && [ -n "$PGDATABASE" ] && export DB_DATABASE="$PGDATABASE"
[ -z "$DB_USERNAME" ] && [ -n "$PGUSER" ]     && export DB_USERNAME="$PGUSER"
[ -z "$DB_PASSWORD" ] && [ -n "$PGPASSWORD" ] && export DB_PASSWORD="$PGPASSWORD"
[ -z "$DB_CONNECTION" ]                        && export DB_CONNECTION="pgsql"

# Railway Redis service exposes REDISHOST/REDISPORT/REDISPASSWORD (no underscore).
# Map them to Laravel's expected REDIS_HOST/REDIS_PORT/REDIS_PASSWORD when empty.
[ -z "$REDIS_HOST" ]     && [ -n "$REDISHOST" ]     && export REDIS_HOST="$REDISHOST"
[ -z "$REDIS_PORT" ]     && [ -n "$REDISPORT" ]     && export REDIS_PORT="$REDISPORT"
[ -z "$REDIS_PASSWORD" ] && [ -n "$REDISPASSWORD" ] && export REDIS_PASSWORD="$REDISPASSWORD"

export NGINX_RESOLVER

envsubst '${PORT}${REVERB_HOST}${REVERB_PORT}${NGINX_RESOLVER}' \
    < /etc/nginx/templates/default.conf.template \
    > /etc/nginx/nginx.conf

# ----------------------------------------------------------------
# 3. Storage permissions
# ----------------------------------------------------------------
mkdir -p storage/framework/{cache/data,sessions,views} storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# ----------------------------------------------------------------
# 4. Start supervisord (nginx + php-fpm) NOW so healthcheck passes
# ----------------------------------------------------------------
echo "Starting supervisord..."
supervisord -c /etc/supervisord.conf &
SUPERVISORD_PID=$!

# ----------------------------------------------------------------
# 5. Wait for php-fpm socket then run artisan setup
# ----------------------------------------------------------------
echo "Waiting for php-fpm..."
for i in $(seq 1 30); do
    nc -z 127.0.0.1 9000 2>/dev/null && break
    sleep 1
done

php artisan config:clear --no-interaction 2>/dev/null || true

echo "Waiting for database..."
RETRIES=30
until php artisan db:show --no-interaction > /dev/null 2>&1 || [ "$RETRIES" -eq 0 ]; do
    echo "  DB not ready, retrying in 2s... ($RETRIES retries left)"
    sleep 2
    RETRIES=$((RETRIES - 1))
done

if [ "$RETRIES" -gt 0 ]; then
    php artisan migrate --force --no-interaction
    php artisan config:cache  --no-interaction 2>/dev/null || true
    php artisan route:cache   --no-interaction 2>/dev/null || true
    php artisan view:cache    --no-interaction 2>/dev/null || true
    php artisan storage:link --force --no-interaction 2>/dev/null || true
    echo "Setup complete."
else
    echo "WARNING: DB not reachable after 60s. Skipping migrations."
fi

# ----------------------------------------------------------------
# 6. Keep supervisord as PID 1
# ----------------------------------------------------------------
wait $SUPERVISORD_PID
