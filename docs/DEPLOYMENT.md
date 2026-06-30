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
- `OMNI_DB_PATH`: optional conversation SQLite file location. Mount its parent directory on durable storage.
- `OMNI_AUTH_DB_PATH`: optional credentials/sessions SQLite file location. Also place on durable storage.
- `BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`: used **once** to create the first administrator. The password is scrypt-hashed on startup and never stored or logged; if an admin already exists they are ignored. Unset them after the first successful launch.
- `SESSION_TTL_MS`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MS`: optional session/lockout tuning (sensible defaults apply).
- `ALLOW_DEMO_RESET`: keep unset in normal operation. Set to `true` only for disposable demonstrations.

> Never commit real credentials. `.env`, `*.sqlite*`, `data.json`, and `backups/` are git-ignored. Provide secrets through your platform's secret manager, not the repo.

## Data Durability

- Persist `omni-inbox.sqlite` and `omni-auth.sqlite`, their WAL files, and the `backups/` directory on a durable volume.
- Copy encrypted backups to another machine or managed object storage on a schedule. Local redundancy cannot protect against total disk loss.
- Monitor `/healthz`; `storage.integrity` must be `ok` and `storage.lastBackupError` must be `null`.
- The first launch imports a legacy `data.json` automatically. It remains untouched as an additional migration fallback.

## Production Checklist

- Use HTTPS. LINE webhooks require a public HTTPS endpoint. Over HTTPS the session cookie is automatically marked `Secure`.
- Bootstrap the first admin via env vars, sign in, then unset the bootstrap vars. Use a long, random admin password.
- Store tokens and channel secrets encrypted.
- Configure off-device encrypted backup replication and restoration drills.
- Add request logs, audit logs, and error tracking.
- Configure webhook retries and idempotency.
- Add CI that runs `npm test` and `npm run check`.
