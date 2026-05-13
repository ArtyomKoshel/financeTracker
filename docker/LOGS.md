# Просмотр логов Docker

## Все сервисы (в реальном времени)

```powershell
docker compose -f docker/docker-compose.yml logs -f
```

## Отдельные сервисы

```powershell
# API (Laravel)
docker compose -f docker/docker-compose.yml logs -f api

# Reverb (WebSocket)
docker compose -f docker/docker-compose.yml logs -f reverb

# Web (Vite)
docker compose -f docker/docker-compose.yml logs -f web

# PostgreSQL
docker compose -f docker/docker-compose.yml logs -f postgres
```

## Последние N строк

```powershell
docker compose -f docker/docker-compose.yml logs --tail=100 api
```

## Без follow (однократный вывод)

```powershell
docker compose -f docker/docker-compose.yml logs api
```

## По времени

```powershell
docker compose -f docker/docker-compose.yml logs --since 10m api
```

## Файлы логов Laravel (внутри контейнера)

Логи также пишутся в `api/storage/logs/laravel.log`:

```powershell
Get-Content api\storage\logs\laravel.log -Tail 50 -Wait
```
