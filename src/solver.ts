// The solver's contract: what goes in, what comes out, and the solve function
// that ties the steps together. It is being built one issue at a time
// (ELL-227 through ELL-233). So far it picks the mode and the teams; rounds
// are not built yet, so most behavior tests still fail on purpose.
import { dealIntoTeams, pickModeAndTeams } from './modeAndTeams'
import { buildRounds, findUncoverablePositions } from './rounds'
import type { Goal, Player, Position, Session } from './types'

// Picked automatically from headcount; the coach never chooses.
// See "The three modes" in docs/PLANNING.md.
export type Mode = 'twoTeams' | 'threeTeams' | 'singleField'

// Why an assignment carries an asterisk in the coach view:
//   emergencyOnly  the position was covered by an EmergencyOnly-rated player
//   overrodeNever  an explicit goal placed a player somewhere rated Never
//   midRoundSplit  the last-resort mid-round position split was used
export type AssignmentFlag = 'emergencyOnly' | 'overrodeNever' | 'midRoundSplit'

export interface FieldAssignment {
  playerId: string
  position: Position
  flag?: AssignmentFlag
}

// One hitting group's turn at bat — half an inning, not a full one.
export interface Round {
  field: FieldAssignment[]

  // Who bats this round, in batting order. The order carries over between
  // rounds: round two starts with whoever was due up when round one ended.
  batters: string[]
}

export interface Team {
  // Fixed once at the start of practice; only the hitting rotation moves.
  playerIds: string[]

  // The team's batting order. Non-hitters never appear in it.
  battingOrder: string[]
}

export interface UnmetGoal {
  goal: Goal
  reason: string
}

// Everything the solver produces for one practice.
export interface Practice {
  mode: Mode

  // Empty in single-field mode, which has no teams at all.
  teams: Team[]

  rounds: Round[]

  // Goals that could not be satisfied. These live with the goal list in the
  // coach view, never on the sheet the team reads.
  unmetGoals: UnmetGoal[]

  // Plain-language notes explaining every flagged assignment.
  footnotes: string[]

  // Plain-language reasons the solver refused to build a lineup at all: too
  // few players, or a required position nobody present can cover. When this
  // has anything in it there are no rounds. Empty for a normal practice.
  // See "Hard rules" in docs/PLANNING.md.
  blockers: string[]
}

export interface SolverInput {
  roster: Player[]
  session: Session
  goals: Goal[]
}

// Fewer than this and there is no real hitting group left once nine are in
// the field, so there is no scrimmage. (Decided with Ellie, ELL-228.)
const MIN_PLAYERS_FOR_A_SCRIMMAGE = 11

// The defense always fields a full nine in single-field mode; whoever is
// left over hits.
const FIELDERS_IN_SINGLE_FIELD_MODE = 9

// The ids of the players on a side who bat, in the order they were dealt.
// Real batting-order rules (default slots) arrive in ELL-231.
function hittersOf(players: Player[]): string[] {
  return players.filter((player) => player.hits).map((player) => player.id)
}

// Single-field mode has no teams, but it does have fixed hitting groups that
// take turns, built the same way teams are: dealt out by position. Players
// who do not hit are not in a group, so they are always free for the defense.
function buildHittingGroups(presentPlayers: Player[]): Player[][] {
  const groupSize = presentPlayers.length - FIELDERS_IN_SINGLE_FIELD_MODE
  const hitters = presentPlayers.filter((player) => player.hits)
  const groupCount = Math.ceil(hitters.length / groupSize)
  return dealIntoTeams(hitters, groupCount)
}

export function solve(input: SolverInput): Practice {
  const presentPlayers = input.roster.filter((player) =>
    input.session.presentPlayerIds.includes(player.id),
  )

  // Step one: the mode and the teams, before anyone is assigned anywhere.
  const { mode, teams: teamsOfPlayers } = pickModeAndTeams(presentPlayers)

  const teams: Team[] = teamsOfPlayers.map((teamPlayers) => ({
    playerIds: teamPlayers.map((player) => player.id),
    battingOrder: hittersOf(teamPlayers),
  }))

  // Step two: reasons to stop before building anything.
  const blockers: string[] = []
  if (presentPlayers.length < MIN_PLAYERS_FOR_A_SCRIMMAGE) {
    blockers.push(
      `Only ${presentPlayers.length} players are here today. ` +
        `A scrimmage needs at least ${MIN_PLAYERS_FOR_A_SCRIMMAGE}: nine in the field and two to hit.`,
    )
  }
  blockers.push(...findUncoverablePositions(presentPlayers))
  if (blockers.length > 0) {
    return { mode, teams, rounds: [], unmetGoals: [], footnotes: [], blockers }
  }

  // Step three: the rounds. The sides that take turns hitting are the teams,
  // or in single-field mode the fixed hitting groups.
  const hittingSides =
    mode === 'singleField' ? buildHittingGroups(presentPlayers) : teamsOfPlayers
  const battingOrders = hittingSides.map((side) => hittersOf(side))

  const built = buildRounds(presentPlayers, hittingSides, battingOrders, input.session)

  // Not built yet: goals and unmet goals (ELL-229), even pitching and rest
  // (ELL-232), Emergency-only flags (ELL-233).
  return {
    mode,
    teams,
    rounds: built.rounds,
    unmetGoals: [],
    footnotes: built.footnotes,
    blockers: built.blockers,
  }
}