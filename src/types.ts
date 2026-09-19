// The core data model for the whole app: players, sessions, and goals.
// This file exists so every other module agrees on what these words mean.
// It mirrors the "Data model" and "Goals" sections of docs/PLANNING.md.

// The nine softball positions. Every player carries a rating at every one of
// them — there are no blanks (see "Position ratings" in the planning doc).
export const POSITIONS = [
  'P',
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
] as const

export type Position = (typeof POSITIONS)[number]

// What a rating tells the solver:
//   Starter        first choice here, assign freely
//   Backup         fine here when starters are unavailable or busy
//   EmergencyOnly  only when nothing else covers the position; flagged with *
//   Never          the solver never picks this on its own — but an explicit
//                  coach goal overrides it (flagged with *). Never is the
//                  default for every new player; the coach marks exceptions.
export type PositionRating = 'Starter' | 'Backup' | 'EmergencyOnly' | 'Never'

export interface Player {
  // Hidden internal identifier. Goals and attendance point at this, never at
  // the name, so two players with the same display name can't be confused.
  // The coach never sees or types it. (Decided with Ellie, ELL-225.)
  id: string

  // Display name, used on all output.
  name: string

  // A rating for every position. No blanks.
  ratings: Record<Position, PositionRating>

  // Where she usually hits, 1 = leadoff. Optional, and the lowest-priority
  // influence on the batting order.
  defaultBattingSlot?: number

  // Standing flag: does she bat at all? Not a per-day decision. A pitcher who
  // never bats still counts as fully participating.
  hits: boolean
}

// How each round ends. Set once for the whole session, not per round.
export type RoundStructure =
  | { kind: 'threeOuts' }
  | { kind: 'fixedBatters'; battersPerRound: number }

// Everything entered fresh each practice. Nothing here is saved afterward.
export interface Session {
  // Who is here today: the ids of present players. In or out, nothing else.
  presentPlayerIds: string[]

  // Total practice time for scrimmage, in minutes.
  minutesAvailable: number

  // How long one round takes. The app suggests 7; always editable.
  minutesPerRound: number

  roundStructure: RoundStructure
}

// What a goal verb means:
//   FieldsAt        she plays this position whenever her team is on defense
//   MaximizeAtBats  move her up the order so she comes around more often
//   Rest            keep her out entirely
export type GoalVerb = 'FieldsAt' | 'MaximizeAtBats' | 'Rest'

// A goal is a small structured object, never a sentence. Goals live in an
// ordered list where order is priority: when two goals want the same body,
// the one higher in the list wins.
export interface Goal {
  playerId: string
  verb: GoalVerb

  // Set only when the verb is FieldsAt. The other verbs take no position.
  position?: Position
}
