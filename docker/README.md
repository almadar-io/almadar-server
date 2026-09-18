# Self-hosting an Almadar app (reference stack)

App server + PostgreSQL + CouchDB, deployable anywhere `docker compose` runs.
Works for both server flavors — `@almadar/server` (Express) and `@almadar/server-hono`
re-export the same env/config contract, so one image serves either.

## Up

```bash
cp .env.example .env   # then edit the secrets
docker compose up --build
```

The app starts on `:3030` once `db` and `couchdb` report healthy.

## Backend selection

`DATA_BACKEND` in `.env`:

- `postgres` — relational adapter (typed tables, FKs). The `DATABASE_URL` pointing
  at the `db` service is pre-wired by the compose file.
- `couchdb` — document adapter; `COUCHDB_URL` is pre-wired similarly.
- `firebase` — uses your Firebase env vars instead of the bundled services.
- `mock` — refused when `NODE_ENV=production`.

## Known limitation (no schema evolution yet)

The PostgreSQL adapter is **create-only**: tables are generated from the entity
schema at boot, but changes to entity fields after the database exists are not
applied (no `ALTER TABLE` automation). Until the schema-evolution tools land,
a schema change means resetting the data:

```bash
docker compose down -v   # destroys pgdata
docker compose up
```

Plan your data accordingly; backups are your responsibility (see below).

## Backup / restore

```bash
# PostgreSQL
docker compose exec db pg_dump -U "$PG_USER" "$PG_DB" > backup.sql
cat backup.sql | docker compose exec -T db psql -U "$PG_USER" "$PG_DB"

# CouchDB
docker run --rm --volumes-from "$(docker compose ps -q couchdb)" \
  -v "$PWD:/backup" alpine tar czf /backup/couchdata.tar.gz /opt/couchdb/data
```
