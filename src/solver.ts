// The solver's contract: what goes in, what comes out, and the solve function
// that ties the steps together. It is being built one issue at a time
// (ELL-227 through ELL-233). So far it picks the mode and the teams; rounds
// are not built yet, so most behavior tests still fail on purpose.
import { pickModeAndTeams } from './modeAndTeams'
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
}

export interface SolverInput {
  roster: Player[]
  session: Session
  goals: Goal[]
}

export function solve(input: SolverInput): Practice {
  const presentPlayers = input.roster.filter((player) =>
    input.session.presentPlayerIds.includes(player.id),
  )

  // Step one: the mode and the teams, before anyone is assigned anywhere.
  const { mode, teams: teamsOfPlayers } = pickModeAndTeams(presentPlayers)

  const teams: Team[] = teamsOfPlayers.map((teamPlayers) => ({
    playerIds: teamPlayers.map((player) => player.id),

    // For now, simply the team's hitters in the order they were dealt.
    // Real batting-order rules (default slots, carry-over) arrive in ELL-231.
    battingOrder: teamPlayers
      .filter((player) => player.hits)
      .map((player) => player.id),
  }))

  // Not built yet: rounds (ELL-228 onward), unmet goals and footnotes
  // (ELL-229, ELL-233). Until then a practice has teams but no rounds.
  return { mode, teams, rounds: [], unmetGoals: [], footnotes: [] }
}
