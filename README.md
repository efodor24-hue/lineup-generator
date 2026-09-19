# Practice Lineup Builder

Builds scrimmage lineups for softball practice. Takes today's attendance, a
prioritized list of coaching goals, and session settings, and produces lineups
for the practice — fast, offline, and with no accounts or server.

The full specification lives in [`docs/PLANNING.md`](docs/PLANNING.md). How to
work on this repo is spelled out in [`CLAUDE.md`](CLAUDE.md).

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer (comes with npm)

## Run it

```
npm install
npm run dev
```

Then open the local address Vite prints (usually http://localhost:5173).

## Test it

```
npm test
```

Runs the whole test suite once with Vitest. During development, `npx vitest`
keeps the suite running and re-runs on every save.

## Build it

```
npm run build
```

Type-checks and produces the deployable static site in `dist/`. Preview that
exact build with `npm run preview`.

## Status

Repo scaffolding only (build stage 0). No types, no solver, no real UI yet —
see the build order in `docs/PLANNING.md` and the Linear project
**Practice Lineup Builder** for what comes next.
