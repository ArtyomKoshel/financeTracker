# Запуск finance-tracker через Docker
# Проект: finance-tracker (контейнеры с префиксом finance-tracker-*)
# API: http://localhost:8000
# Reverb: ws://localhost:8080

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

param(
    [switch]$Build,
    [switch]$Migrate,
    [switch]$MigrateData,
    [switch]$Fresh
)

$composeFile = "docker/docker-compose.yml"

if ($Fresh) {
    Write-Host "Пересоздание контейнеров..." -ForegroundColor Yellow
    docker compose -f $composeFile down
}

if ($Build) {
    docker compose -f $composeFile build --no-cache
}

docker compose -f $composeFile up -d postgres
Start-Sleep -Seconds 5

if ($Migrate) {
    Write-Host "Миграции схемы..." -ForegroundColor Yellow
    docker compose -f $composeFile run --rm api php artisan migrate --force
}

if ($MigrateData) {
    Write-Host "Перенос данных из data/finance.db..." -ForegroundColor Yellow
    docker compose -f $composeFile run --rm api php artisan migrate:from-go /var/www/data/finance.db
}

docker compose -f $composeFile up -d

Write-Host "`nAPI: http://localhost:8000" -ForegroundColor Green
Write-Host "Reverb: ws://localhost:8080" -ForegroundColor Green
Write-Host "App: http://localhost:4001" -ForegroundColor Green
Write-Host "`nЛоги: docker compose -f docker/docker-compose.yml logs -f [nginx|api|reverb|web]" -ForegroundColor Cyan
