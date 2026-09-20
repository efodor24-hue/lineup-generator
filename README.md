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

## The private folder

`private/` is ignored by git and holds the real team roster, used only for
checking lineups by eye against players the coaches know. This repo is public,
so nothing in `private/` is ever committed. The automated tests do not use it —
they run against the fake roster in `src/testRoster.ts`. If real roster data
ever needs to go into git, it goes in under placeholder names only.

## Status

Build stage 2, the headless solver, is underway. It picks the practice mode
and splits players into teams; it does not build rounds yet, so most behavior
tests still fail on purpose. No real UI yet — see the build order in `docs/PLANNING.md` and the
Linear project **Practice Lineup Builder** for what comes next.
