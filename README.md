# Sluggers Super Draft

## setting up

start the database:

```shell
docker compose up db
```

install packages:

```shell
npm install
```

copy `.env.example` to `.env` and provide a `DATABASE_URL` with your connection string.

run db migrations:

```shell
npm run db:migrate
```

> TODO: ingest seed data

start the web server:

```shell
npm run dev
```

visit `http://localhost:3000`
