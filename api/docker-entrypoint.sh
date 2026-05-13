#!/bin/sh
set -e

cd /var/www/html

if [ ! -f vendor/autoload.php ]; then
    composer install --no-interaction
fi

if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
    else
        echo "APP_KEY=" > .env
        echo "DB_CONNECTION=pgsql" >> .env
        echo "DB_HOST=postgres" >> .env
        echo "DB_DATABASE=finance" >> .env
        echo "DB_USERNAME=finance" >> .env
        echo "DB_PASSWORD=secret" >> .env
    fi
    php artisan key:generate --no-interaction 2>/dev/null || true
fi

# Docker: всегда переопределить DB на PostgreSQL (127.0.0.1 не работает внутри контейнера)
if [ -f .env ]; then
    sed -i.bak 's/^DB_CONNECTION=.*/DB_CONNECTION=pgsql/' .env 2>/dev/null || true
    sed -i.bak 's|^DB_DATABASE=.*|DB_DATABASE=finance|' .env 2>/dev/null || true
    sed -i.bak 's/^DB_HOST=.*/DB_HOST=postgres/' .env 2>/dev/null || true
    sed -i.bak 's/^DB_PORT=.*/DB_PORT=5432/' .env 2>/dev/null || true
    sed -i.bak 's/^DB_USERNAME=.*/DB_USERNAME=finance/' .env 2>/dev/null || true
    sed -i.bak 's/^DB_PASSWORD=.*/DB_PASSWORD=secret/' .env 2>/dev/null || true
    rm -f .env.bak 2>/dev/null || true
fi

rm -f bootstrap/cache/config.php 2>/dev/null || true
php artisan config:clear 2>/dev/null || true
# package:discover только при первом запуске (packages.php создаётся один раз)
if [ ! -f bootstrap/cache/packages.php ]; then
    php artisan package:discover --ansi 2>/dev/null || true
fi

# Создать директории и выставить права — PHP-FPM (www-data) должен писать в cache, logs
mkdir -p storage/framework/{cache/data,sessions,views} storage/logs bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

# Принудительно задать DB для Docker (перебивает .env)
export DB_CONNECTION=pgsql
export DB_HOST=postgres
export DB_PORT=5432
export DB_DATABASE=finance
export DB_USERNAME=finance
export DB_PASSWORD=secret

exec "$@"
