FROM php:8.4-fpm

RUN apt-get update && apt-get install -y \
    curl \
    libzip-dev \
    libpng-dev \
    libicu-dev \
    libpq-dev \
    libsqlite3-dev \
    libonig-dev \
    unzip \
    git \
    supervisor \
    && docker-php-ext-configure intl \
    && docker-php-ext-install -j$(nproc) pdo_pgsql pdo_sqlite mbstring zip intl opcache pcntl bcmath \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN echo "\
opcache.enable=1\n\
opcache.memory_consumption=128\n\
opcache.interned_strings_buffer=16\n\
opcache.max_accelerated_files=10000\n\
opcache.validate_timestamps=1\n\
opcache.revalidate_freq=2\n\
" > /usr/local/etc/php/conf.d/opcache.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
