// The solver's contract: what goes in, what comes out. The solve function
// below is a deliberate stub that throws — ELL-226 writes the behavior tests
// first, and this file exists so they compile and fail honestly. The real
// implementation lands across ELL-227 through ELL-233.
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

export function solve(_input: SolverInput): Practice {
  throw new Error('solver not implemented yet: the tests come first (ELL-226)')
}
