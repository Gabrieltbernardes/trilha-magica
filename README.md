# Trilha Mágica

A game-based web tool that assesses three executive functions in children
(about 7-8 years old): **inhibitory control** (Stroop-style game), **working
memory** (Corsi-block game) and **cognitive flexibility** (WCST-style game).
Built as an undergraduate thesis project by Gabriel Teixeira Bernardes.
The user interface is in Brazilian Portuguese.

Each teacher ("admin") gets a personal link. Results are scored relative to
the group that played through that link, and shown in a per-teacher admin panel
(with CSV/PDF export).

## Requirements

- JDK 11 or newer (no Maven, Node or external database needed locally)

## Run locally

```sh
./build.sh && ./run.sh          # Windows: build.bat, then run.bat
```

Then open:

| URL | Who | What |
| --- | --- | --- |
| `http://localhost:3000/<teacher-username>.html` | children | start the games |
| `http://localhost:3000/admin/trilhas/index.html` | teachers | results panel |
| `http://localhost:3000/dev/trilhas/index.html` | developer | manage teacher accounts |

The admin and developer URLs are intentionally unlisted. Locally the app uses
SQLite (`data/trilha_magica.db`).

## Configuration

All settings come from environment variables. **No passwords are stored in the
source code.**

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL URL (Heroku Postgres sets it); SQLite is used if unset | unset |
| `TRILHA_ADMIN_USERNAME` | username of the first teacher account | `professor` |
| `TRILHA_ADMIN_PASSWORD` | its password; used only when the account is first created | random |
| `TRILHA_DEV_USERNAME` | developer-panel username | `dev` |
| `TRILHA_DEV_PASSWORD` | developer-panel password; re-applied on every start, so changing it rotates the password | random |

If a password variable is not set when the account is first created, a random
password is generated and printed **once** in the startup log. Passwords are
stored only as salted hashes.

```sh
export TRILHA_DEV_PASSWORD='choose-a-long-passphrase'
export TRILHA_ADMIN_PASSWORD='another-long-passphrase'
./run.sh                        # Windows: set VAR=value, then run.bat
```

## Deploy to Heroku

```sh
heroku create <app-name>
heroku addons:create heroku-postgresql:essential-0
heroku config:set TRILHA_DEV_PASSWORD='...' TRILHA_ADMIN_PASSWORD='...'
git push heroku main
```

Heroku's filesystem is ephemeral, which is why PostgreSQL is used there. The
`pom.xml`, `Procfile` and `system.properties` exist only for the Heroku build;
local builds use plain `javac`.

## Privacy

- Participants' data lives only in the database. `data/`, `*.db`, `.env` and
  exported reports are git-ignored; never commit them.
- Prefer codes or pseudonyms instead of children's real names when collecting data.

## Layout

```
src/com/trilhamagica/   Java backend (JDK HTTP server, JDBC, scoring)
public/                 frontend: games, admin panel, developer panel
docs/                   long technical write-up in Portuguese (partly outdated)
```
