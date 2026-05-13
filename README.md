# Finance Tracker

Персональный учёт финансов: доходы, расходы, цели, повторяющиеся платежи, лимиты по категориям.

**Стек:** Laravel 11 API (PHP 8.4) + Vite SPA (TypeScript, vanilla) + PostgreSQL 16 + Reverb (WebSocket).

## Быстрый старт (Windows)

```powershell
.\docker-dev.ps1 -Build           # первый раз (сборка контейнеров)
.\docker-dev.ps1 -Migrate         # миграции БД
.\docker-dev.ps1                  # запуск
.\docker-dev.ps1 -Fresh -Migrate -MigrateData  # полный перезапуск
```

## URL

| Сервис | URL |
|--------|-----|
| Приложение | http://localhost:4001 |
| API (nginx) | http://localhost:8000 |
| Swagger UI | http://localhost:8000/api/docs |
| Reverb WS | ws://localhost:8080 |

**Остановка:** `docker compose -f docker/docker-compose.yml stop`

## Логи

```powershell
docker compose -f docker/docker-compose.yml logs -f [nginx|api|reverb|web|postgres]
```

## Архитектура

| Компонент | Описание |
|-----------|----------|
| `api/` | Laravel 11 API (PHP 8.4-FPM), JWT, FormRequests, 21 сервис |
| `web/` | Vite SPA (TypeScript vanilla), тёмная тема, Chart.js |
| `docker/` | docker-compose: nginx, PHP-FPM, PostgreSQL, Reverb, Redis |

## Документация

| Документ | Описание |
|----------|----------|
| [docs/PROJECT.md](docs/PROJECT.md) | Архитектура, глоссарий, схема БД, расчёты, выполненные улучшения |
| [docs/ROADMAP.md](docs/ROADMAP.md) | План развития: desktop layout, заметки, календарь, backlog |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | История изменений по версиям |
| [docs/openapi.yaml](docs/openapi.yaml) | OpenAPI 3.0 спецификация (Swagger UI на `/api/docs`) |
