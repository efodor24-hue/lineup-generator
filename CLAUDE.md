# CLAUDE.md

## What this project is

A practice lineup builder for a college softball team. It takes today's attendance,
a prioritized list of coaching goals, and some session settings, and produces
scrimmage lineups for a practice.

The primary user is a head coach who did not build this tool and will not read its
code. Everything is judged by whether it makes sense to her cold.

## The planning doc is the source of truth

`docs/PLANNING.md` in this repo holds the full specification: data model, solver
rules, the three modes, output formats, behavior scenarios, and an explicit list of
non-goals.

Rules for working with it:

- Read it before starting any task. Re-read the relevant section before changing
  behavior that section describes.
- When something in the doc conflicts with an idea you have, the doc wins. Say so
  and ask, rather than quietly doing it your way.
- When the doc is silent on something, that is a question, not an invitation. See
  "No assumptions" below.
- When we decide something new in conversation, update the doc in the same session.
  A decision that lives only in chat history is lost.
- The "Non-goals" section is binding. Do not build things on that list, even if
  they seem like small additions or obvious wins.

## Linear

All work is tracked in the Linear project **Practice Lineup Builder** (team ELL).
Be meticulous about this. The board should always reflect reality, and I should
never have to reconstruct what happened from the git log.

Rules:

- **Every piece of work has an issue before it has code.** If I ask for something
  with no issue, create the issue first, show me the title and description, then
  start.
- **Move the issue to In Progress when you start it**, and to Done only when it
  actually meets its own "Done when" line. Not when the code compiles.
- **One issue, one concern.** If an issue turns out to contain two things, split it
  and tell me.
- **Write findings back to the issue as comments**, not only in chat. Decisions,
  surprises, things that turned out harder than expected. Chat history is lost;
  the issue is not.
- **Discovered work becomes a new issue** in the right milestone. Do not silently
  expand the scope of the one you are on.
- Milestones map to the six build stages. Do not start an issue in a later
  milestone while an earlier one is unfinished.
- When a decision changes the spec, update `docs/PLANNING.md` and note the change
  in the issue.

## Git

GitHub, pull request per issue. No commits straight to main.

Remote: `https://github.com/efodor24-hue/lineup-generator.git`

- **One branch per Linear issue**, using the branch name Linear generates for that
  issue. It links the branch, PR, and issue together automatically.
- **Small, frequent commits** with messages that say what changed and why. Present
  tense, no ceremony: `add rest distribution to solver`, not `updates`.
- **Never commit failing tests as passing work.** If tests fail, either fix them or
  say so in the commit message and the issue.
- **One PR per issue.** The PR description states what changed, what was tested,
  and anything I should look at closely. Include the issue's magic word so it
  closes on merge.
- **Do not merge any PR until I say so.** By default I merge them myself. If I
  explicitly tell you to merge a specific PR, merge that one. An instruction
  covers only the PR it names — it is never standing permission.
- Never force push a shared branch. Never rewrite history on main.
- Do not commit secrets, `.env` files, or `node_modules`. Set up `.gitignore`
  early.
- If you are about to do something destructive (reset, rebase, discard changes),
  stop and ask first.

## How to talk to me

**Ask questions one at a time.** This matters more than it sounds. If you have four
things to clarify, ask the first one, wait for my answer, then ask the next. A
numbered list of questions is much harder to answer well than a conversation, and I
will end up skipping some of them.

Ask the question that most changes what you would build first.

**No assumptions.** If a requirement is ambiguous, underspecified, or missing from
the planning doc, stop and ask. Do not:

- pick a reasonable default and mention it in passing
- build something plausible and note the assumption in a comment
- infer intent from other parts of the codebase

An unfinished conversation is cheaper than unwinding code built on a guess.

Two exceptions where you should just proceed: obvious mechanical choices with no
user-visible consequence, and anything the planning doc already answers.

**Do not add unrequested cleverness.** No extra features, no speculative
abstractions, no "while I was in there" refactors. If you think something is worth
adding, say so and let me decide.

**Tell me when I am wrong.** If I ask for something that conflicts with the doc,
breaks a stated constraint, or will cause a problem later, say so directly before
doing it.

## Testing

This project is built behavior-first. The planning doc contains a set of behavior
scenarios written as given/when/then. Those are the test suite.

Workflow for any solver work:

1. Write the tests from the relevant scenarios first.
2. Run them and show me that they fail, before writing implementation.
3. Write the minimum implementation that makes them pass.
4. Run the full suite and show me the result.

Standards:

- Test names describe behavior, not functions. `assigns every present player to at
  least one round` rather than `test solver 3`.
- Every hard rule in the planning doc has a test that would catch its violation.
- When I report a bug, first write a failing test that reproduces it, show me the
  failure, then fix it.
- Never change a test to make it pass. If a test is wrong, say why and ask.
- Do not mock the solver in solver tests. It is pure logic with no external
  dependencies and should be tested directly.

## Documentation

- Each module starts with a short comment explaining what it does and why it
  exists, not how it works.
- The solver in particular needs to be readable by someone who does not write much
  code. Favor obvious loops and named intermediate variables over dense or clever
  expressions.
- Comment the reasoning behind any non-obvious rule, and reference the planning doc
  section it comes from.
- Keep a `README.md` current with how to run, test, and build the project.
- Update docs in the same commit as the change they describe.

## Technical constraints

These are hard. Code that violates them is wrong regardless of how well it works.

- **No LLM API calls anywhere in the app.** All logic is deterministic.
- **Works offline** after first load.
- **No backend, no server, no database, no accounts.** Static site.
- **Roster persists in browser local storage**, plus export and import to a JSON
  file.
- **The solver must return in well under a second.** Greedy, no search. Speed beats
  optimality, always.

## Stack

Single-page React app, Vite, TypeScript, Tailwind. Boring and well-trodden by
preference. Ask before adding any dependency.

## Build order

Build in this order and do not skip ahead. Finish and verify each stage before
starting the next.

0. Repo setup: git init, `.gitignore`, Vite scaffold, test runner, first commit
1. Types and a fake 15-player roster
2. The solver, headless, no UI at all
3. A bare output view, ugly tables only
4. The three-step wizard: attendance, goals, lineups
5. Roster management, including export and import
6. Polish: palette, spacing, print stylesheet, paste formats

## Vocabulary

Get these right, they are easy to misread.

- **Round**: one hitting group's turn at bat. A half inning, not a full inning.
  Seven rounds is about 3.5 innings.
- **Playable**: full infield plus at least two outfielders. It does not mean legal.
  Practice lineups do not follow a rulebook.
- Fielding and hitting are independent. Some players never bat and are still fully
  participating.
