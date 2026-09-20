// The behavior scenarios from docs/PLANNING.md, written before any solver
// code exists (ELL-226). Every test here fails until the solver is built —
// solve() currently throws on purpose. These tests are the specification:
// never soften one to make it pass. If a test looks wrong, say so and ask.
//
// Tests follow the same order as the "Behavior scenarios" section of the
// planning doc, and each one names the scenario it encodes.
import { describe, expect, it } from 'vitest'
import type { Practice, Round } from './solver'
import { solve } from './solver'
import { LARGE_TEST_ROSTER, TEST_ROSTER } from './testRoster'
import type { Goal, Position, PositionRating, Session } from './types'

const ALL_IDS = TEST_ROSTER.map((player) => player.id)

// Twelve players: enough to practice, not enough for real teams. The mode
// selection scenario says this headcount runs single-field.
const TWELVE_IDS = ALL_IDS.filter(
  (id) => !['reese', 'rowan', 'peyton'].includes(id),
)

// Everyone except Maya, the only player rated above EmergencyOnly at first
// base. With her absent, covering 1B forces a flagged compromise.
const WITHOUT_MAYA = ALL_IDS.filter((id) => id !== 'maya')

// Look up a player's rating without repeating the find() dance everywhere.
function ratingOf(playerId: string, position: Position): PositionRating {
  const player = TEST_ROSTER.find((p) => p.id === playerId)
  if (!player) throw new Error(`no such test player: ${playerId}`)
  return player.ratings[position]
}

// A typical session: 49 minutes at 7 per round makes the 7 rounds the
// planning doc scenarios are written against, with 5 batters per round.
function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    presentPlayerIds: ALL_IDS,
    minutesAvailable: 49,
    minutesPerRound: 7,
    roundStructure: { kind: 'fixedBatters', battersPerRound: 5 },
    ...overrides,
  }
}

function solveWith(
  goals: Goal[] = [],
  overrides: Partial<Session> = {},
): Practice {
  return solve({ roster: TEST_ROSTER, session: makeSession(overrides), goals })
}

// The 20-player roster, for the scenarios that need enough bodies for two
// teams. Each player is listed under the group she is rated best at, which is
// the group the solver deals her out with.
const LARGE_IDS = LARGE_TEST_ROSTER.map((player) => player.id)
const LARGE_PITCHERS = ['harper', 'quinn', 'reese', 'ellis']
const LARGE_CATCHERS = ['delaney', 'rowan', 'casey']
const LARGE_INFIELDERS = ['maya', 'emerson', 'mia', 'sydney', 'jordan', 'blake', 'dakota']
const LARGE_OUTFIELDERS = ['kennedy', 'avery', 'brooklyn', 'peyton', 'riley', 'finley']

function solveLargeRoster(presentPlayerIds: string[]): Practice {
  return solve({
    roster: LARGE_TEST_ROSTER,
    session: makeSession({ presentPlayerIds }),
    goals: [],
  })
}

function fielderIds(round: Round): string[] {
  return round.field.map((assignment) => assignment.playerId)
}

// Every player who shows up anywhere in the practice, field or batting order.
function everyoneWhoAppears(practice: Practice): Set<string> {
  const seen = new Set<string>()
  for (const round of practice.rounds) {
    for (const id of fielderIds(round)) seen.add(id)
    for (const id of round.batters) seen.add(id)
  }
  return seen
}

// Resting means the dugout: neither fielding nor batting that round.
function restCount(practice: Practice, playerId: string): number {
  let resting = 0
  for (const round of practice.rounds) {
    const played =
      fielderIds(round).includes(playerId) || round.batters.includes(playerId)
    if (!played) resting += 1
  }
  return resting
}

// Playable = pitcher, catcher, all four infield spots, and at least two
// outfielders — eight players minimum. Full infield includes P and C
// (confirmed with Ellie during ELL-226; see Vocabulary in the planning doc).
const ALWAYS_REQUIRED: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS']
const OUTFIELD: Position[] = ['LF', 'CF', 'RF']

describe('everyone plays', () => {
  it('assigns every present player to the practice at least once', () => {
    // Given 15 players present and 7 rounds, with any set of goals.
    const practice = solveWith()
    expect(practice.rounds).toHaveLength(7)

    const seen = everyoneWhoAppears(practice)
    for (const id of ALL_IDS) {
      expect(seen, `${id} was left out of the whole practice`).toContain(id)
    }
  })
})

describe('everyone plays, even a pitcher who does not hit', () => {
  it('gets a non-hitting pitcher into the practice when a teammate could pitch every round', () => {
    // Found on the real roster (ELL-228). Two pitchers who do not bat land on
    // the same team. One only pitches; the other could also stand in the
    // outfield in an emergency. The solver kept handing the ball to the
    // pitcher-only player, and the other one never appeared at all. Pitching
    // is her only way into the practice, so she has to get a turn.
    const roster = LARGE_TEST_ROSTER.map((player) =>
      player.id === 'reese'
        ? {
            ...player,
            hits: false,
            ratings: { ...player.ratings, P: 'Starter' as const, LF: 'EmergencyOnly' as const },
          }
        : player,
    )
    const practice = solve({
      roster,
      session: makeSession({ presentPlayerIds: LARGE_IDS }),
      goals: [],
    })
    expect(practice.rounds).toHaveLength(7)

    const seen = everyoneWhoAppears(practice)
    for (const id of LARGE_IDS) {
      expect(seen, `${id} was left out of the whole practice`).toContain(id)
    }
  })
})

describe('nobody is in two places', () => {
  it('never puts a player in the field and the batting group of the same round', () => {
    // The only allowed exception is the mid-round split, which requires an
    // active maximize-at-bats goal. There are no goals here, so there must
    // be no overlap at all.
    const practice = solveWith()
    for (const round of practice.rounds) {
      const fielders = fielderIds(round)
      for (const batter of round.batters) {
        expect(
          fielders,
          `${batter} is batting and fielding in the same round`,
        ).not.toContain(batter)
      }
    }
  })

  it('lets the only catcher field and hit in the same round, flagged, when her team is up', () => {
    // Thirteen present, three teams, and with Rowan and Riley out Delaney is
    // the only player who can catch at any level. When her team hits, hard
    // rules 1 and 3 collide. Ellie's call: she does both, and it is flagged.
    const onlyOneCatcher = ALL_IDS.filter((id) => !['rowan', 'riley'].includes(id))
    const practice = solveWith([], { presentPlayerIds: onlyOneCatcher })
    expect(practice.rounds.length).toBeGreaterThan(0)

    let delaneySplitRounds = 0
    for (const round of practice.rounds) {
      for (const assignment of round.field) {
        const alsoBatting = round.batters.includes(assignment.playerId)
        if (alsoBatting) {
          expect(
            assignment.flag,
            `${assignment.playerId} is in two places with no mid-round split flag`,
          ).toBe('midRoundSplit')
        }
        if (alsoBatting && assignment.playerId === 'delaney') {
          expect(assignment.position).toBe('C')
          delaneySplitRounds += 1
        }
      }
    }
    expect(delaneySplitRounds, 'Delaney never caught and hit in the same round').toBeGreaterThan(0)
    expect(practice.footnotes.length, 'no footnote explains the split').toBeGreaterThan(0)
  })

  it('keeps the two sides apart in two-team mode: one team fields while the other hits', () => {
    const practice = solveLargeRoster(LARGE_IDS)
    expect(practice.rounds).toHaveLength(7)

    practice.rounds.forEach((round, index) => {
      // Teams alternate: team one hits first, then team two, and so on.
      const hittingTeam = practice.teams[index % 2]
      const fieldingTeam = practice.teams[(index + 1) % 2]
      for (const batter of round.batters) {
        expect(hittingTeam.playerIds, `${batter} batted out of turn`).toContain(batter)
      }
      for (const id of fielderIds(round)) {
        expect(fieldingTeam.playerIds, `${id} fielded while her team was hitting`).toContain(id)
      }
    })
  })
})

describe('no blanks', () => {
  it('fills pitcher, catcher, the whole infield, and at least two outfield spots in every round', () => {
    const practice = solveWith()
    for (const round of practice.rounds) {
      const filled = round.field.map((assignment) => assignment.position)
      for (const position of ALWAYS_REQUIRED) {
        expect(filled, `${position} is empty in a round`).toContain(position)
      }
      const outfielders = filled.filter((position) =>
        OUTFIELD.includes(position),
      )
      expect(outfielders.length, 'fewer than two outfielders').toBeGreaterThanOrEqual(2)
    }
  })

  it('fields all nine positions when nine or more players are available for the defense', () => {
    // Fifteen present, three teams of five: ten players are on the two
    // fielding teams every round, so there is no reason to leave a spot open.
    const practice = solveWith()
    expect(practice.rounds).toHaveLength(7)
    for (const round of practice.rounds) {
      const filled = new Set(round.field.map((assignment) => assignment.position))
      expect(filled.size, 'a position was left open with players to spare').toBe(9)
    }
  })

  it('builds no lineup and says so when nobody present can catch', () => {
    // Delaney, Rowan, and Riley are the only players rated at catcher at any
    // level. With all three out, the tool stops rather than guessing.
    const noCatcher = ALL_IDS.filter(
      (id) => !['delaney', 'rowan', 'riley'].includes(id),
    )
    const practice = solveWith([], { presentPlayerIds: noCatcher })
    expect(practice.rounds).toHaveLength(0)
    expect(practice.blockers.length, 'no reason was given').toBeGreaterThan(0)
    expect(practice.blockers.join(' ').toLowerCase()).toContain('catcher')
  })
})

describe('single-field mode runs fixed hitting groups', () => {
  it('fields nine and bats a fixed group of three when twelve are present', () => {
    const practice = solveWith([], { presentPlayerIds: TWELVE_IDS })
    expect(practice.rounds).toHaveLength(7)

    const groupsInOrder: string[][] = []
    for (const round of practice.rounds) {
      expect(round.field, 'the defense is not a full nine').toHaveLength(9)

      // Five batters per round from a group of three means the group bats
      // around, so count the different players, not the plate appearances.
      const hittingGroup = [...new Set(round.batters)].sort()
      expect(hittingGroup.length, 'the hitting group is bigger than three').toBeLessThanOrEqual(3)
      expect(hittingGroup.length).toBeGreaterThanOrEqual(1)
      groupsInOrder.push(hittingGroup)
    }

    // Groups are fixed and take turns: every group that comes up again is the
    // same players as before, and no player is in two different groups.
    const distinctGroups = [...new Set(groupsInOrder.map((group) => group.join(',')))]
    const everyGroupMember = distinctGroups.flatMap((group) => group.split(','))
    expect(
      new Set(everyGroupMember).size,
      'a player showed up in two different hitting groups',
    ).toBe(everyGroupMember.length)

    const groupCount = distinctGroups.length
    groupsInOrder.forEach((group, index) => {
      expect(group, 'the groups did not take turns in order').toEqual(
        groupsInOrder[index % groupCount],
      )
    })
  })

  it('shrinks the hitting group to two when eleven are present', () => {
    const eleven = TWELVE_IDS.filter((id) => id !== 'jordan')
    const practice = solveWith([], { presentPlayerIds: eleven })
    expect(practice.mode).toBe('singleField')
    expect(practice.rounds).toHaveLength(7)
    for (const round of practice.rounds) {
      expect(new Set(round.batters).size, 'the hitting group is bigger than two').toBeLessThanOrEqual(2)
      expect(round.field, 'the defense is not a full nine').toHaveLength(9)
    }
  })

  it('builds no lineup and says so when only ten are present', () => {
    const ten = TWELVE_IDS.filter((id) => !['jordan', 'riley'].includes(id))
    const practice = solveWith([], { presentPlayerIds: ten })
    expect(practice.rounds).toHaveLength(0)
    expect(practice.blockers.length, 'no reason was given').toBeGreaterThan(0)
  })
})

describe('three-outs rounds list the whole order', () => {
  it("lists the hitting team's whole batting order every round", () => {
    const practice = solveWith([], { roundStructure: { kind: 'threeOuts' } })
    expect(practice.rounds).toHaveLength(7)

    practice.rounds.forEach((round, index) => {
      const hittingTeam = practice.teams[index % practice.teams.length]
      expect(round.batters).toEqual(hittingTeam.battingOrder)
    })
  })
})

describe('goals are honored in priority order', () => {
  it('gives the position to the higher goal and reports the lower one unmet', () => {
    // Single-field mode has one shortstop spot per round, so these two goals
    // cannot both hold. Mia's is ranked higher, so Mia gets shortstop and
    // Sydney's goal is reported, not silently dropped.
    const goals: Goal[] = [
      { playerId: 'mia', verb: 'FieldsAt', position: 'SS' },
      { playerId: 'sydney', verb: 'FieldsAt', position: 'SS' },
    ]
    const practice = solveWith(goals, { presentPlayerIds: TWELVE_IDS })

    // The winning goal has to actually happen. Without this check, a solver
    // that benched Mia all practice would pass while ignoring the top goal.
    let miaPlayedShortstop = false
    for (const round of practice.rounds) {
      const mia = round.field.find((a) => a.playerId === 'mia')
      if (mia) {
        expect(mia.position, 'Mia is fielding somewhere other than SS').toBe('SS')
        miaPlayedShortstop = true
      }
    }
    expect(miaPlayedShortstop, 'Mia never played shortstop at all').toBe(true)

    const unmetPlayerIds = practice.unmetGoals.map((u) => u.goal.playerId)
    expect(unmetPlayerIds, "Sydney's losing goal was not reported").toContain('sydney')
  })
})

describe('fielding and hitting alternate naturally', () => {
  it('does not report a fielding goal unmet in rounds her team is hitting', () => {
    const goals: Goal[] = [{ playerId: 'mia', verb: 'FieldsAt', position: 'SS' }]
    const practice = solveWith(goals)

    // When her team is on defense, she is at shortstop.
    for (const round of practice.rounds) {
      const mia = round.field.find((a) => a.playerId === 'mia')
      if (mia) expect(mia.position).toBe('SS')
    }

    // When her team is hitting, she is not in the field — and that is not a
    // failure or a compromise.
    const batsSomewhere = practice.rounds.some((round) =>
      round.batters.includes('mia'),
    )
    expect(batsSomewhere, 'Mia never bats at all').toBe(true)

    const unmetPlayerIds = practice.unmetGoals.map((u) => u.goal.playerId)
    expect(unmetPlayerIds, "Mia's satisfied goal was reported unmet").not.toContain('mia')
  })
})

describe('pitchers get equal work', () => {
  it('splits pitching innings evenly among the available pitchers', () => {
    // Three pitchers are present (Harper, Quinn, Reese) across 7 rounds, so
    // innings pitched may differ by at most one. Their rest is deliberately
    // not compared against position players — see the rest test below,
    // which excludes them.
    const practice = solveWith()

    const inningsPitched = new Map<string, number>()
    for (const round of practice.rounds) {
      const pitcher = round.field.find((a) => a.position === 'P')
      if (pitcher) {
        inningsPitched.set(
          pitcher.playerId,
          (inningsPitched.get(pitcher.playerId) ?? 0) + 1,
        )
      }
    }

    // Only actual pitchers should ever pitch here (nobody else is rated).
    const counts = ['harper', 'quinn', 'reese'].map(
      (id) => inningsPitched.get(id) ?? 0,
    )
    const spread = Math.max(...counts) - Math.min(...counts)
    expect(spread, `innings pitched were ${counts.join(', ')}`).toBeLessThanOrEqual(1)
  })
})

describe('rest spreads evenly', () => {
  it('keeps the gap between the most-rested and least-rested position player as small as possible', () => {
    // With 15 present in three-team mode, two teams (10 players) cover 9
    // field spots each round, so exactly one player rests per round. Spread
    // evenly over 7 rounds, the most-rested position player should have sat
    // at most one round more than the least-rested one.
    const practice = solveWith()

    const positionPlayers = ALL_IDS.filter(
      (id) => ratingOf(id, 'P') === 'Never',
    )
    const rests = positionPlayers.map((id) => restCount(practice, id))
    const spread = Math.max(...rests) - Math.min(...rests)
    expect(spread, `rest counts were ${rests.join(', ')}`).toBeLessThanOrEqual(1)
  })
})

describe('non-hitters are still included', () => {
  it('keeps a non-hitter out of every batting order but still in the practice', () => {
    // Harper is flagged as not hitting.
    const practice = solveWith()

    for (const round of practice.rounds) {
      expect(round.batters, 'Harper was put in a batting order').not.toContain('harper')
    }
    for (const team of practice.teams) {
      expect(team.battingOrder, "Harper is in a team's batting order").not.toContain('harper')
    }
    expect(
      everyoneWhoAppears(practice),
      'Harper never played at all',
    ).toContain('harper')
  })
})

describe('mode selection', () => {
  it('builds three fixed teams when fifteen players are present', () => {
    const practice = solveWith()
    expect(practice.mode).toBe('threeTeams')
    expect(practice.teams).toHaveLength(3)

    // Teams are disjoint and cover everyone.
    const assigned = practice.teams.flatMap((team) => team.playerIds)
    expect(assigned).toHaveLength(15)
    expect(new Set(assigned).size).toBe(15)
  })

  it('runs single-field mode with no teams when twelve players are present', () => {
    const practice = solveWith([], { presentPlayerIds: TWELVE_IDS })
    expect(practice.mode).toBe('singleField')
    expect(practice.teams).toHaveLength(0)
  })

  it('builds three small teams when thirteen players are present', () => {
    // One more than the single-field cutoff. Ellie runs three small teams
    // that combine on defense at 13 or 14, not single-field.
    const thirteen = ALL_IDS.filter((id) => !['reese', 'peyton'].includes(id))
    const practice = solveWith([], { presentPlayerIds: thirteen })
    expect(practice.mode).toBe('threeTeams')
    expect(practice.teams).toHaveLength(3)
  })

  it('builds two teams when twenty are present and each side can field a defense alone', () => {
    const practice = solveLargeRoster(LARGE_IDS)
    expect(practice.mode).toBe('twoTeams')
    expect(practice.teams).toHaveLength(2)

    // Teams are disjoint and cover everyone.
    const assigned = practice.teams.flatMap((team) => team.playerIds)
    expect(assigned).toHaveLength(20)
    expect(new Set(assigned).size).toBe(20)

    // Each side has its own pitcher and its own catcher.
    for (const team of practice.teams) {
      const pitchers = team.playerIds.filter((id) => LARGE_PITCHERS.includes(id))
      const catchers = team.playerIds.filter((id) => LARGE_CATCHERS.includes(id))
      expect(pitchers.length, 'a team has no pitcher').toBeGreaterThanOrEqual(1)
      expect(catchers.length, 'a team has no catcher').toBeGreaterThanOrEqual(1)
    }
  })

  it('falls back to three teams when there are enough players for two but only one can catch', () => {
    // Seventeen present is plenty of bodies for two teams of eight, but with
    // Rowan, Casey, and Riley out, Delaney is the only player who can catch
    // at any level. Two sides cannot each have a catcher, so it is three teams.
    const oneCatcher = LARGE_IDS.filter(
      (id) => !['rowan', 'casey', 'riley'].includes(id),
    )
    const practice = solveLargeRoster(oneCatcher)
    expect(practice.mode).toBe('threeTeams')
    expect(practice.teams).toHaveLength(3)
  })
})

describe('teams are split by position', () => {
  it('deals each position group out evenly and keeps team sizes within one', () => {
    const practice = solveLargeRoster(LARGE_IDS)

    const sizes = practice.teams.map((team) => team.playerIds.length)
    expect(
      Math.max(...sizes) - Math.min(...sizes),
      `team sizes were ${sizes.join(', ')}`,
    ).toBeLessThanOrEqual(1)

    const groups = {
      pitchers: LARGE_PITCHERS,
      catchers: LARGE_CATCHERS,
      infielders: LARGE_INFIELDERS,
      outfielders: LARGE_OUTFIELDERS,
    }
    for (const [groupName, groupIds] of Object.entries(groups)) {
      const perTeam = practice.teams.map(
        (team) => team.playerIds.filter((id) => groupIds.includes(id)).length,
      )
      expect(
        Math.max(...perTeam) - Math.min(...perTeam),
        `${groupName} were split ${perTeam.join(' / ')}`,
      ).toBeLessThanOrEqual(1)
    }
  })
})

describe('batting order carries over', () => {
  it('starts the next hitting round where the last one left off and wraps', () => {
    // The planning doc's example is a hitting group of 6 with 5 batters per
    // round. Our 15-player roster in three-team mode makes groups of 5, so
    // 4 batters per round exercises the same wrap: a team's second hitting
    // round must start with her 5th batter, not back at the top.
    const practice = solveWith([], {
      roundStructure: { kind: 'fixedBatters', battersPerRound: 4 },
    })

    for (const team of practice.teams) {
      const teamIds = new Set(team.playerIds)
      const hittingRounds = practice.rounds.filter((round) =>
        round.batters.every((batter) => teamIds.has(batter)),
      )
      const sequence = hittingRounds.flatMap((round) => round.batters)
      sequence.forEach((batter, index) => {
        expect(
          batter,
          `batter ${index + 1} in the team's combined sequence broke the wrap`,
        ).toBe(team.battingOrder[index % team.battingOrder.length])
      })
    }
  })
})

describe('manual edit becomes a goal', () => {
  it('re-solves around a manual placement added as the top-priority goal', () => {
    // The UI turns a hand edit into a new top-priority goal and re-runs the
    // solver. At the solver level that is: prepend the goal, solve again,
    // and the placement holds while everything else adjusts around it.
    const manualEdit: Goal = { playerId: 'mia', verb: 'FieldsAt', position: '2B' }
    const practice = solveWith([manualEdit])

    let miaFieldedSomewhere = false
    for (const round of practice.rounds) {
      const mia = round.field.find((a) => a.playerId === 'mia')
      if (mia) {
        miaFieldedSomewhere = true
        expect(mia.position, 'the manual placement did not hold').toBe('2B')
      }
    }
    expect(miaFieldedSomewhere, 'Mia never fielded at all').toBe(true)
  })
})

describe('compromises are flagged, not blocked', () => {
  it('fills a position nobody good is available for and explains itself', () => {
    // Maya is the only player rated above EmergencyOnly at first base.
    // Without her, the solver still fills 1B, flags it, adds a footnote,
    // and does not stop to ask.
    const practice = solveWith([], { presentPlayerIds: WITHOUT_MAYA })

    for (const round of practice.rounds) {
      const first = round.field.find((a) => a.position === '1B')
      expect(first, '1B was left empty').toBeDefined()
      expect(first?.flag, 'the 1B compromise carries no flag').toBe('emergencyOnly')
    }
    expect(practice.footnotes.length, 'no footnote explains the compromise').toBeGreaterThan(0)
  })
})

describe('ratings are respected, until they are overruled', () => {
  it('never assigns a player to a position rated Never without a goal', () => {
    const practice = solveWith()
    for (const round of practice.rounds) {
      for (const assignment of round.field) {
        expect(
          ratingOf(assignment.playerId, assignment.position),
          `${assignment.playerId} was put at ${assignment.position}, rated Never`,
        ).not.toBe('Never')
      }
    }
  })

  it('puts a player at a Never position when a goal says so, and flags it', () => {
    // Emerson is rated Never at catcher; the coach has a reason the tool
    // does not. The tool does it and marks it visible.
    const goals: Goal[] = [{ playerId: 'emerson', verb: 'FieldsAt', position: 'C' }]
    const practice = solveWith(goals)

    let emersonCaught = false
    for (const round of practice.rounds) {
      const emerson = round.field.find((a) => a.playerId === 'emerson')
      if (emerson) {
        emersonCaught = true
        expect(emerson.position, 'the goal was ignored').toBe('C')
        expect(emerson.flag, 'the overridden Never carries no flag').toBe('overrodeNever')
      }
    }
    expect(emersonCaught, 'Emerson never fielded at all').toBe(true)
  })

  it('uses an EmergencyOnly player when nothing better covers the position, and flags it', () => {
    // Same thin first base as the compromise scenario: with Maya out, only
    // EmergencyOnly players remain at 1B. It gets filled anyway, flagged.
    const practice = solveWith([], { presentPlayerIds: WITHOUT_MAYA })

    for (const round of practice.rounds) {
      const first = round.field.find((a) => a.position === '1B')
      expect(first, '1B was left empty').toBeDefined()
      if (first) {
        expect(
          ratingOf(first.playerId, '1B'),
          'someone rated Never was chosen over asking',
        ).toBe('EmergencyOnly')
        expect(first.flag).toBe('emergencyOnly')
      }
    }
  })
})
