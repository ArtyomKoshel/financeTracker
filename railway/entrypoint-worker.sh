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

# Railway PostgreSQL plugin exposes PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.
[ -z "$DB_HOST" ]     && [ -n "$PGHOST" ]     && export DB_HOST="$PGHOST"
[ -z "$DB_PORT" ]     && [ -n "$PGPORT" ]     && export DB_PORT="$PGPORT"
[ -z "$DB_DATABASE" ] && [ -n "$PGDATABASE" ] && export DB_DATABASE="$PGDATABASE"
[ -z "$DB_USERNAME" ] && [ -n "$PGUSER" ]     && export DB_USERNAME="$PGUSER"
[ -z "$DB_PASSWORD" ] && [ -n "$PGPASSWORD" ] && export DB_PASSWORD="$PGPASSWORD"
[ -z "$DB_CONNECTION" ]                        && export DB_CONNECTION="pgsql"

# Railway Redis service exposes REDISHOST/REDISPORT/REDISPASSWORD.
[ -z "$REDIS_HOST" ]     && [ -n "$REDISHOST" ]     && export REDIS_HOST="$REDISHOST"
[ -z "$REDIS_PORT" ]     && [ -n "$REDISPORT" ]     && export REDIS_PORT="$REDISPORT"
[ -z "$REDIS_PASSWORD" ] && [ -n "$REDISPASSWORD" ] && export REDIS_PASSWORD="$REDISPASSWORD"

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
