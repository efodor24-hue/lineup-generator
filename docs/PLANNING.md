# Practice Lineup Builder: Planning Doc

## The problem

Building scrimmage lineups for practice takes a lot of brain power and a lot of time. The coach has to hold all of it at once: who is actually here today, who plays what, how many rounds fit in the block, who has not hit yet, who needs reps somewhere new, and who is about to get stranded in the same spot for the fourth round running.

The tool does not need to be clever. It needs to be fast. A good-enough lineup in five seconds beats a perfect lineup in two minutes. Speed over optimality is the governing tradeoff for the entire build.

Scope is practice scrimmages only. Game lineups run on a separate system. Station planning is already handled and is not part of this.

## Who uses it

**Primary user: the head coach.** She is the one making the lineups before practice, and she did not build this tool. That single fact drives most of the design. Nothing can be fiddly, nothing can assume knowledge of how it works underneath, and nothing can require a second attempt to understand. It has to make sense cold.

**Secondary user: the assistant coach (builder).** Same workflow, separate copy, no shared data.

Nobody else uses it. No other coaches, no players logging in, no admins. Two people, two independent copies.

Usage context: laptop, before practice, unhurried but impatient. Not a phone in the dugout. The result gets pasted into a practice plan in Google Docs and into the team GroupMe.

## Hard technical constraints

These are not preferences. Build decisions that violate any of these are wrong.

- **No LLM API calls.** Nothing in this app talks to a model. All logic is deterministic code. This rules out natural language goal entry, which is why goals are structured inputs.
- **Works offline.** Once loaded, no network required.
- **No backend, no server, no database, no accounts.** Static site, deployable anywhere.
- **Roster persists in browser storage** on each user's own machine. The two users never share state.
- **Roster export and import as a file.** A download button that dumps the roster to JSON, and a matching import. This is the safety net against a cleared browser, and it lets the file live in Google Drive.

Suggested stack: a single-page React app, Vite build, Tailwind for styling, plain TypeScript for the solver. Nothing exotic. The person building this is comfortable setting things up but is relying on Claude Code for the code itself, so favor boring, well-trodden choices over anything clever.

## Vocabulary

**Round.** One hitting group's turn at bat. This is a half inning, not a full inning. Seven rounds is roughly three and a half innings, not seven innings.

This is the single most misreadable term in the app, so the UI must state it in plain language on screen wherever rounds are entered, and show the conversion: "7 rounds, about 3.5 innings, about 49 minutes."

**Round length.** Roughly seven minutes in practice. That is the default the app suggests, always editable per session. Time is the primary input because coaches estimate time better than innings, and the app converts to a round count.

**Playable.** The lineup feels game-like. That means a full infield plus at least two outfielders. Full infield includes the pitcher and catcher: playable is P, C, 1B, 2B, 3B, SS, and at least two outfield spots — eight players minimum on defense. (Clarified during ELL-226.) It does not mean legal. Batting orders can repeat names, players can enter and leave freely, and nobody is checking a rulebook.

**Round structure.** Each round runs either to three outs or to a fixed number of batters. This is set once for the whole session, not per round. Fixed batters is the more common choice because it makes at-bats deterministic and lets the app actually guarantee even reps.

**Hitting and fielding are separate.** A player has a standing flag for whether she hits at all. Pitchers who do not bat still count as fully participating. Being in the field and being in the batting order are independent facts.

## Data model

### Player (stored, edited rarely)

| Field | Notes |
| --- | --- |
| Internal ID | Hidden identifier the app uses so goals and attendance point at a player unambiguously, even if two players share a display name. Never shown to or typed by the coach. (Decided during ELL-225.) |
| Name | Display name used on all output |
| Positions | A rating for every position, not just the ones she plays. See the ratings table below. |
| Default batting slot | Optional. Where she usually hits. Lowest-priority influence on the order. |
| Hits | Yes or no. Standing flag, not a per-day decision. |

The roster is set once around September and changes rarely. It lives in the app, editable by hand.

### Position ratings

Every player carries a rating at every position. There are no blanks, which means the roster screen is a full grid of players by positions. That is more setup work once in September, and it is what gives the solver real information to work with when things get tight.

| Rating | Meaning for the solver |
| --- | --- |
| Starter | First choice here. Assign freely. |
| Backup | Fine here. Assign when starters are unavailable or committed elsewhere. |
| Emergency only | Only when nothing else covers the position. Flag it with an asterisk when used. |
| Never | Do not assign her here. |

**Never is not absolute.** It blocks the solver's own choices, but an explicit goal overrides it. If the coach sets a goal putting a player somewhere rated Never, the tool does it, because she has a reason and the tool does not. Flag it with an asterisk so it is visible, then get out of the way.

This is the same principle as everywhere else in the app: ratings guide the solver, the coach's stated intent outranks them.

**Setup default: everything starts at Never.** A new player is rated Never everywhere, and the coach marks only the exceptions. Filling in twenty players by nine positions from scratch would be miserable, and most cells would say Never anyway. Marking the handful of real positions per player is a minute of work instead of twenty.

### Session (entered fresh each practice)

- Attendance: a simple in or out toggle per player. No injury status, no partial availability, no late arrivals.
- Time available, in minutes.
- Minutes per round, defaulting to 7 and editable.
- Round structure: three outs, or N batters per round.

Nothing about a session is saved after it is used. Practice plans already live in Google Docs, and that is where the history belongs.

### Goal

A goal is a small structured object, not a sentence. Shape:

`{ player, verb, position? }`

`player` here means the player's hidden internal ID, not her display name.

Goals live in an ordered list. Order is priority. Higher wins conflicts.

## The three modes

The app picks the mode automatically from headcount. The coach never selects one.

**Two-team mode.** Two fixed teams, set once at the start of practice, alternating between hitting and fielding. Teams do not shuffle between rounds.

**Three-team mode.** Three fixed teams. One hits while the other two combine to make the defense, then they rotate. Teams stay fixed all practice; only the hitting rotation moves. This was the real shape of a recent practice: 15 players, 3 teams, 5 batters per round.

**Single-field mode (short-handed).** When there are not enough players for real teams, the structure changes rather than degrades. There is one defense on the field and a rotating hitting group, which may be only three or four people. There are no teams at all in this mode.

**How the mode is picked.** (Decided during ELL-227.) The solver prefers the biggest teams that actually work, in this order:

1. **Two teams** whenever that is feasible. Feasible means each team can field a playable defense entirely on its own: at least 16 players present (8 per side), and the players can be split so each side has its own pitcher, its own catcher, all four infield spots, and at least two outfielders, with nobody placed at a position she is rated Never. Emergency only counts as covered.
2. **Three teams** when two teams is not feasible and at least 13 players are present. Two teams combine on defense, so position coverage is much easier.
3. **Single-field** at 12 or fewer.

Headcount alone is not enough: 18 players with only one catcher present is three teams, not two.

**How players are split into teams.** (Decided during ELL-227.) By position only. The solver deals players out one at a time, going around the teams: all the pitchers first, then the catchers, then the infielders, then the outfielders. That spreads every position group evenly and keeps team sizes within one of each other. Because pitchers are spread out, non-hitters are too, so batting orders come out about the same length. Nothing else is balanced — not talent, not batting slots. A player's group is the one she is rated best at; anyone rated to pitch counts as a pitcher.

The modes are genuinely different products of the solver, not variations in team count. In particular they need different output views, covered below.

## Solver rules

The solver is a greedy pass down the priority list. No search, no optimization, no backtracking beyond what is trivially cheap. It must return in well under a second.

### Hard rules, never violated

1. **No player is in two places in the same round.** She cannot field and hit simultaneously. This is the top rule.
2. **Every player marked present appears somewhere in the practice at least once.** Field or batting order, either counts. A pitcher who never bats still counts as included. If someone would be left out entirely, the solver has failed.
3. **The field is playable in every round:** full infield plus at least two outfielders.

### Soft objectives, in order

1. Goals, in the coach's priority order.
2. Pitchers get equal innings among today's available pitchers. Their rest pattern is not compared against position players, and it is fine if they get less rest overall. A pitcher is anyone present who is rated to pitch (anything other than Never at P), including a player who also plays a position. For a two-way player like that, her equal share of pitching innings is the only workload limit: in rounds she is not pitching she is free to field her other position or hit, and she is not part of the rest-evenness rule below. (Clarified during ELL-226.)
3. Rest is spread as evenly as possible across everyone else. No hard cap, just minimize the spread.
4. Default batting slots, applied last, only once everything else has settled. A player with no default slot is never pushed down the order because of it: missing data is not a penalty. Players without a slot fill the open spots in the order, mixed in with everyone else, not lined up behind all the players who have one. (Decided during ELL-245, so new players with no history are not deprioritized.)

### The mid-round split, last resort only

A position can in principle be split mid-round: a catcher catches part of the round, then steps out to take her at-bat while someone else catches. This is real but undesirable.

The solver may only consider it in two situations, and never by default:

1. A maximize-at-bats goal is active on that player.
2. She is due to hit, and nobody else available for the defense can cover a required position she plays — for example the only catcher at practice, in a round her team is up. Hard rules 1 and 3 collide here, and this is how the collision is settled: she does both. If anyone rated Emergency only or better can cover the position, that player fills in instead (flagged as usual) and there is no split. (Decided during ELL-228.)

When a split is used the result is flagged. The lineup shows her fielding and hitting in the same round, with an asterisk and a footnote. The tool does not name who covers her spot during her at-bat; the coach sorts that out on the field.

## Goals

Because there is no language model, goals are built from dropdowns rather than typed. The shape is player, verb, and sometimes a position.

### Verbs

| Verb | Takes a position | Meaning |
| --- | --- | --- |
| Fields at | Yes | She plays this position whenever her team is on defense |
| Maximize at-bats | No | Move her up in the order so she comes around more often |
| Rest | No | Keep her out of this round entirely |

Maximize is a quality, not a number. The coach does not want to specify how many at-bats, just that this person should get more of them.

Group goals are out of scope for the MVP. Wanting all four catchers to maximize at-bats means adding four goals by hand, which is acceptable.

### Priority and conflicts

Goals are an ordered list and the coach arranges them. When two goals want the same body, the higher one wins and the tool simply decides. It does not stop to ask.

### Manual override

After seeing the output, the coach will want to change things by hand, and that must be supported.

The mechanism is elegant and should be the only one: **a manual edit becomes a new top-priority goal and the solver re-runs.** Moving a player to second base adds "her, fields at, second" at the top of the list. Everything else re-solves around it. No separate locking system, no frozen cells, one concept.

Re-running will be common. Expect the coach to tweak and re-run several times per practice, so the goal list stays visible and the table refreshes in place without losing her position on the page.

### When something cannot be done

If the solver cannot satisfy a goal, or has to put someone at a position they are not rated for, it marks the affected spot with an asterisk and a short footnote. Non-blocking. It does not stop and ask for a decision, it does the best it can and is honest about it.

Notes about unmet goals live with the goal list, not on the lineup sheet. The sheet the team reads stays clean.

## Output

### Coach view

Shows everything: all teams, all rounds, every position filled, plus the asterisks and footnotes. This is her working view while she tweaks.

### Player-facing view

What the team actually reads. The layout follows the mode:

- **Two or three teams:** organized by team. A player sees her team's batting order and the positions her team is playing that round. She does not need to see the other teams.
- **Single-field mode:** one unified sheet. Everyone is mixed together, so splitting it by team would be more confusing, not less.

Batting order is the reading order. When the coach reads lineups aloud she goes down the order, so that is how the sheet should be arranged.

### Paste to GroupMe

One message, whole practice, all teams, sent to the full team chat. Not per team, not per round. Plain text that survives a paste into a chat window.

### Paste to the practice plan

The practice plan lives in a Google Doc. The lineup table needs to paste in cleanly and keep its structure. Simple tables only, nothing that relies on CSS to be readable.

### Print

A print stylesheet. She likes a physical copy on the clipboard.

## Look and feel

The head coach likes things to look nice, and that is a real requirement rather than a nicety. Clean and modern, generous white space, the Notion end of the spectrum rather than the clipboard end.

### Palette

Emmanuel College Saints colors, used as accents on a neutral base rather than painted everywhere. Keep them in CSS variables so they are swappable.

| Role | Color |
| --- | --- |
| Primary accent | Blue, #1F4B7E |
| Secondary accent | Gold, #F2B90B |
| Structure | Muted grey-blue, #90A6BF, for borders, rules, table lines. Not a feature color. |
| Base | White |

### Flow

A three-step wizard, each step finished before the next:

1. **Attendance.** Toggle who is here. This gets done and gets out of the way.
2. **Goals.** Add goals, arrange by priority.
3. **Lineups.** The output, with edit and re-run available in place.

No jumping back to attendance from the results screen. Late arrivals are a discipline problem, not a software problem.

## Non-goals

This section exists so nobody helpfully builds these. Each one was considered and rejected.

- **Multi-team or multi-program support.** This is for one team. Do not design for scale.
- **Saved session history.** Practice plans already live in Google Docs. The app does not remember past practices.
- **Injury or limited-status tracking.** Too volatile, changes too fast, stays in the coach's head. Attendance is a single in-or-out toggle.
- **Natural language goal entry.** Requires a model. Ruled out by the offline constraint.
- **Accounts, login, sharing, sync.** Two people, two independent copies.
- **Late arrivals.** Not modeled.
- **Rulebook legality.** Practice lineups do not need to be legal, only playable.
- **Game lineups.** Different system entirely.
- **Group goal selection.** Nice later, not in the MVP.

## Behavior scenarios

These are written to be turned directly into tests against the solver, before any interface exists. Given a roster and attendance, when goals are applied, then the output should hold.

### Everyone plays

> Given 15 players present and 7 rounds,
> When the solver runs with any set of goals,
> Then every one of the 15 appears in the practice at least once, in the field or in a batting order.

This is the most important single check. If someone the coach meant to play is missing, the tool failed.

### Nobody is in two places

> Given any lineup the solver produces,
> When any round is inspected,
> Then no player appears in both the field and the batting group for that round.

The only exception is the deliberate mid-round split, which must carry a flag. It requires either an active maximize-at-bats goal on that player, or a required position that nobody else available can cover (see "The mid-round split").

> Given three-team mode and only one player present who can catch at any level,
> When her team is the one hitting,
> Then she appears in both the field at catcher and the batting group for that round,
> And that assignment is flagged as a mid-round split with a footnote,
> And nobody else is in two places.

### No blanks

> Given enough players to be playable,
> When any round is inspected,
> Then every infield position is filled and at least two outfield positions are filled.

### Goals are honored in priority order

> Given a goal "Mia fields at shortstop" ranked above "Sydney fields at shortstop",
> When the two cannot both be satisfied,
> Then Mia gets shortstop and Sydney's goal is reported unmet.

### Fielding and hitting alternate naturally

> Given Mia has a goal to field at shortstop,
> When her team is on defense, then she is at shortstop.
> When her team is hitting, then she is not in the field, and that is not a failure or a compromise.

### Pitchers get equal work

> Given three available pitchers and 7 rounds,
> When the solver runs,
> Then their innings pitched differ by no more than one.
> And their rest totals are not compared against position players.

### Rest spreads evenly

> Given more players than roster spots,
> When the practice completes,
> Then the difference between the most-rested and least-rested position player is as small as the constraints allow.

### Non-hitters are still included

> Given a player flagged as not hitting,
> When the solver runs,
> Then she never appears in a batting order,
> And she still counts as having played.

### Mode selection

> Given 15 players present, then the solver produces three fixed teams, one hitting while two field.
> Given 12 players present, then the solver produces single-field mode with one defense and a rotating hitting group, and no teams.
> Given 13 players present, then the solver produces three fixed teams.
> Given 20 players present who can be split into two sides that each field a playable defense alone, then the solver produces two fixed teams, each with its own pitcher and catcher.
> Given 17 players present but only one of them able to catch, then the solver produces three teams, not two, because two sides cannot each have a catcher.

### Teams are split by position

> Given enough players for teams,
> When the solver splits them,
> Then pitchers are dealt out evenly across the teams, then catchers, then infielders, then outfielders,
> And team sizes differ by at most one,
> And nothing else is balanced: not talent, not batting slots.

### Batting order carries over

> Given 5 batters per round and a hitting group of 6,
> When round two begins,
> Then it starts with the 6th batter and wraps, so at-bats stay even across the practice.

### Manual edit becomes a goal

> Given a produced lineup,
> When the coach moves a player to a different position by hand,
> Then that placement is added as the top-priority goal and the solver re-runs,
> And the rest of the lineup adjusts around it.

### Compromises are flagged, not blocked

> Given only one player rated at first base and she is unavailable,
> When the solver runs,
> Then it assigns the best available alternative,
> And marks that assignment with an asterisk and a footnote,
> And does not stop to ask.

### Ratings are respected, until they are overruled

> Given a player rated Never at catcher,
> When the solver runs with no goal about her,
> Then she is never assigned to catcher.

> Given the same player,
> When the coach sets a goal putting her at catcher,
> Then she is assigned there,
> And the assignment carries an asterisk.

> Given a position where the only available players are rated Emergency only,
> When the solver runs,
> Then it fills the position anyway and flags it.

## Build order and working with Claude Code

### Order

Build the solver first, in isolation, with no interface at all. It is the hard part and the part where a subtle mistake is invisible until a coach is standing on a field wondering why nobody is at third.

0. **Repo setup.** git init, `.gitignore`, Vite scaffold, test runner, first commit.
1. **Types and a fake roster.** Player, session, goal. A hardcoded 15-player roster to test against.
2. **The solver, headless.** Takes roster plus attendance plus session plus goals, returns rounds. Every scenario above becomes a test. Nothing renders yet.
3. **A bare output view.** Ugly tables, just to see the solver's work.
4. **The three-step wizard.** Attendance, goals, lineups.
5. **Roster management.** Add, edit, ratings grid, hits flag, export and import.
6. **Polish.** Palette, spacing, print stylesheet, paste formats.

### How to prompt it

Hand over this whole document at the start of the session, then work one numbered stage at a time. Do not ask for the whole app in one prompt.

For the solver stage, the useful framing is: write the tests from the behavior scenarios first, confirm they fail, then write the solver until they pass. Ask to see the failing tests before any implementation. That is the check against code that looks right and is not.

Two instructions worth repeating in the session, because models drift toward both:

- Do not add cleverness the doc does not ask for. The non-goals section is binding.
- Keep the solver readable. It will need changing by someone who does not write much code, so favor obvious loops over dense one-liners.

When something feels wrong in the output, the fastest path is usually a new scenario rather than a description of the bug. "Here is a case that should hold and does not" is easier to act on than "the outfield looks weird."

### Tracking and version control

Work is tracked in the Linear project **Practice Lineup Builder** on team ELL. The six build stages above are its milestones, and each has issues seeded under it.

Conventions, spelled out in full in `CLAUDE.md`:

- Every piece of work has an issue before it has code. Discovered work becomes a new issue rather than quiet scope creep.
- Findings and decisions go in issue comments, not only in chat. Chat history is lost; the issue is not.
- An issue moves to Done when it meets its own "Done when" line, not when the code compiles.
- No starting an issue in a later milestone while an earlier one is unfinished.

Git: GitHub, one branch per Linear issue using Linear's generated branch name, one pull request per issue, no commits straight to main, and no self-merging. When a decision changes the spec, this document gets updated in the same session and the change is noted on the issue.

## Open questions

These are easier to answer once something is running than in the abstract. None of them block starting.

- **Rest distribution.** Even spread is the stated objective, but whether that actually feels right in practice is unclear until real output exists. Watch what it does over seven rounds and adjust.
- **Table layout for the coach view.** Rounds as columns reads compactly but gets crowded with multiple teams. Worth building the simplest version and looking at it before deciding.
- **How visible the compromise flags should be.** An asterisk with a footnote is the plan. Whether that is enough, or too much, is a see-it question.
- **Whether the three-team rotation needs its own rest logic**, separate from the general even-spread rule.
