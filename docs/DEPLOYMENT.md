# Deployment

## Local

```bash
npm install
npm run dev
```

## Docker

```bash
docker compose up --build
```

## Environment Variables

- `PORT`: HTTP port. Default: `4317`.
- `PUBLIC_BASE_URL`: public HTTPS origin used when generating webhook URLs, for example `https://support.example.com`.
- `OMNI_DB_PATH`: optional SQLite file location. Mount its parent directory on durable storage.
- `ALLOW_DEMO_RESET`: keep unset in normal operation. Set to `true` only for disposable demonstrations.

## Data Durability

- Persist `omni-inbox.sqlite`, its WAL files, and the `backups/` directory on a durable volume.
- Copy encrypted backups to another machine or managed object storage on a schedule. Local redundancy cannot protect against total disk loss.
- Monitor `/healthz`; `storage.integrity` must be `ok` and `storage.lastBackupError` must be `null`.
- The first launch imports a legacy `data.json` automatically. It remains untouched as an additional migration fallback.

## Production Checklist

- Use HTTPS. LINE webhooks require a public HTTPS endpoint.
- Replace demo header auth with real login.
- Store tokens and channel secrets encrypted.
- Configure off-device encrypted backup replication and restoration drills.
- Add request logs, audit logs, and error tracking.
- Configure webhook retries and idempotency.
- Add CI that runs `npm test` and `npm run check`.
