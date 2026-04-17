# Benni Web UI

Simple web interface to view the first 5 rows from Benni `currency_rates`.

## How it works

- Browser loads this UI on port `8082` by default.
- Nginx proxies `/api/*` requests to `benni-consumer:8081` over Docker network `homeserver_shared`.
- Because requests are same-origin (`/api/...`), no browser CORS setup is required.

## Start order

1. Start Benni stack from project root:

```bash
docker compose up -d --build
```

2. Start consumer API:

```bash
cd other-service
docker compose up -d --build
```

3. Start web UI:

```bash
cd ../web-ui
cp .env.example .env
docker compose up -d --build
```

4. Open UI:

- http://localhost:8082

## Troubleshooting

- If table is empty, run scraper once or wait for cron schedule.
- If UI shows error, check API logs:

```bash
docker logs -f benni-consumer
```

- If UI container cannot reach API, verify both services are on `homeserver_shared` network.
