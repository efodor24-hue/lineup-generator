// Builds the rounds of a practice: who is in the field and who bats, round by
// round. This is where the three hard rules are enforced (see "Hard rules" in
// docs/PLANNING.md): nobody in two places, everyone plays, and the field is
// playable every round. Goals, even pitching, even rest, and compromise flags
// are layered on by later issues (ELL-229 onward).
import type { FieldAssignment, Round } from './solver'
import type { Player, Position, PositionRating, Session } from './types'

const INFIELD_AND_BATTERY: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS']
const OUTFIELD_POSITIONS: Position[] = ['LF', 'CF', 'RF']
const ALL_POSITIONS: Position[] = [...INFIELD_AND_BATTERY, ...OUTFIELD_POSITIONS]

// Playable needs at least this many outfielders. The third is filled whenever
// there is someone to fill it.
const REQUIRED_OUTFIELDERS = 2

// Lower is better. Never is not on the list: the solver never chooses it.
const RATING_RANK: Record<PositionRating, number> = {
  Starter: 0,
  Backup: 1,
  EmergencyOnly: 2,
  Never: 3,
}

// How positions read in a sentence the coach sees.
const POSITION_NAMES: Record<Position, string> = {
  P: 'pitcher',
  C: 'catcher',
  '1B': 'first base',
  '2B': 'second base',
  '3B': 'third base',
  SS: 'shortstop',
  LF: 'left field',
  CF: 'center field',
  RF: 'right field',
}

export interface RoundsResult {
  rounds: Round[]
  footnotes: string[]

  // Reasons no lineup could be built. When this is not empty, rounds is.
  blockers: string[]
}

function canPlay(player: Player, position: Position): boolean {
  return player.ratings[position] !== 'Never'
}

// Before building anything: is there a required position that nobody present
// can cover at all? If so the solver stops and says which one, rather than
// quietly putting someone there. (Decided with Ellie, ELL-228.)
export function findUncoverablePositions(presentPlayers: Player[]): string[] {
  const blockers: string[] = []

  for (const position of INFIELD_AND_BATTERY) {
    const someoneCanPlayIt = presentPlayers.some((player) => canPlay(player, position))
    if (!someoneCanPlayIt) {
      blockers.push(
        `Nobody at practice today is rated to play ${POSITION_NAMES[position]}. ` +
          `Change a rating or add a goal, then try again.`,
      )
    }
  }

  const outfielders = presentPlayers.filter((player) =>
    OUTFIELD_POSITIONS.some((position) => canPlay(player, position)),
  )
  if (outfielders.length < REQUIRED_OUTFIELDERS) {
    blockers.push(
      `Fewer than two players at practice today are rated to play the outfield. ` +
        `Change a rating or add a goal, then try again.`,
    )
  }

  return blockers
}

// Who bats this round. With fixed batters it is the next N names in the order,
// wrapping around, and the caller remembers where it stopped. With three outs
// nobody can know how many will bat, so the whole order is listed.
function pickBatters(
  battingOrder: string[],
  session: Session,
  startIndex: number,
): { batters: string[]; nextStartIndex: number } {
  if (battingOrder.length === 0) return { batters: [], nextStartIndex: 0 }

  if (session.roundStructure.kind === 'threeOuts') {
    return { batters: [...battingOrder], nextStartIndex: startIndex }
  }

  const batters: string[] = []
  let index = startIndex
  for (let i = 0; i < session.roundStructure.battersPerRound; i++) {
    batters.push(battingOrder[index])
    index = (index + 1) % battingOrder.length
  }
  return { batters, nextStartIndex: index }
}

// True when fielding here is this player's only way into the practice: she
// does not hit, she has not fielded yet, and this is a position she is rated
// best at. Hard rule 2 says everyone present plays at least once, so she goes
// ahead of everybody else for this spot. Without this, a pitcher who does not
// bat can sit all practice behind a teammate who always gets the ball.
function mustGetInHere(
  player: Player,
  position: Position,
  roundsFielded: Map<string, number>,
): boolean {
  if (player.hits) return false
  if ((roundsFielded.get(player.id) ?? 0) > 0) return false

  const herBestRank = Math.min(...ALL_POSITIONS.map((p) => RATING_RANK[player.ratings[p]]))
  return RATING_RANK[player.ratings[position]] === herBestRank
}

// From the candidates for one position, pick one. In order:
//   1. Anyone for whom this is her only way into the practice (see above).
//   2. The best rated.
//   3. The player who could fill the fewest of the other open positions, so
//      flexible players are saved for spots only they can cover (a
//      pitcher-only player pitches, leaving the pitcher who also plays right
//      field for right field).
//   4. Whoever has fielded the fewest rounds so far, to keep everyone involved.
function bestCandidate(
  candidates: Player[],
  position: Position,
  otherOpenPositions: Position[],
  roundsFielded: Map<string, number>,
): Player {
  function sortKey(player: Player): number[] {
    const getsInFirst = mustGetInHere(player, position, roundsFielded) ? 0 : 1
    const ratingRank = RATING_RANK[player.ratings[position]]
    const otherSpotsSheCouldFill = otherOpenPositions.filter((other) =>
      canPlay(player, other),
    ).length
    const rounds = roundsFielded.get(player.id) ?? 0
    return [getsInFirst, ratingRank, otherSpotsSheCouldFill, rounds]
  }

  let best = candidates[0]
  let bestKey = sortKey(best)
  for (const candidate of candidates) {
    const candidateKey = sortKey(candidate)
    for (let i = 0; i < candidateKey.length; i++) {
      if (candidateKey[i] < bestKey[i]) {
        best = candidate
        bestKey = candidateKey
        break
      }
      if (candidateKey[i] > bestKey[i]) break
    }
  }
  return best
}

interface FieldResult {
  field: FieldAssignment[]
  footnotes: string[]
  blockers: string[]
}

// Fills the field for one round.
//
// Greedy, no search: always fill the hardest open position next (the one the
// fewest available defenders can play). If nobody on the defense can play a
// required position, look to the hitting side: first someone who is not
// batting this round, and as a last resort someone who is — the mid-round
// split, which is flagged. See "The mid-round split" in the planning doc.
function fillField(
  defenders: Player[],
  hittingSideNotBatting: Player[],
  battersThisRound: Player[],
  roundNumber: number,
  roundsFielded: Map<string, number>,
): FieldResult {
  const field: FieldAssignment[] = []
  const footnotes: string[] = []
  const blockers: string[] = []

  let openPositions = [...ALL_POSITIONS]
  let availableDefenders = [...defenders]

  // Pass one: the defense itself, hardest position first.
  while (true) {
    let hardestPosition: Position | null = null
    let hardestCandidates: Player[] = []
    for (const position of openPositions) {
      const candidates = availableDefenders.filter((player) => canPlay(player, position))
      if (candidates.length === 0) continue
      if (hardestPosition === null || candidates.length < hardestCandidates.length) {
        hardestPosition = position
        hardestCandidates = candidates
      }
    }
    if (hardestPosition === null) break

    const position = hardestPosition
    const otherOpenPositions = openPositions.filter((open) => open !== position)
    const chosen = bestCandidate(hardestCandidates, position, otherOpenPositions, roundsFielded)
    field.push({ playerId: chosen.id, position })
    openPositions = openPositions.filter((open) => open !== position)
    availableDefenders = availableDefenders.filter((player) => player !== chosen)
  }

  // Pass two: required positions the defense could not cover.
  const outfieldersPlaced = field.filter((assignment) =>
    OUTFIELD_POSITIONS.includes(assignment.position),
  ).length
  let outfieldersStillNeeded = Math.max(0, REQUIRED_OUTFIELDERS - outfieldersPlaced)

  let availableNotBatting = [...hittingSideNotBatting]
  let availableBatters = [...battersThisRound]

  for (const position of openPositions) {
    const isOutfield = OUTFIELD_POSITIONS.includes(position)
    if (isOutfield && outfieldersStillNeeded === 0) continue // the optional third outfielder

    const notBattingCandidates = availableNotBatting.filter((player) => canPlay(player, position))
    const battingCandidates = availableBatters.filter((player) => canPlay(player, position))

    if (notBattingCandidates.length > 0) {
      // On the hitting side but not up this round, so she is free to field.
      const chosen = bestCandidate(notBattingCandidates, position, [], roundsFielded)
      field.push({ playerId: chosen.id, position })
      availableNotBatting = availableNotBatting.filter((player) => player !== chosen)
    } else if (battingCandidates.length > 0) {
      // The mid-round split: she fields and hits in the same round.
      const chosen = bestCandidate(battingCandidates, position, [], roundsFielded)
      field.push({ playerId: chosen.id, position, flag: 'midRoundSplit' })
      availableBatters = availableBatters.filter((player) => player !== chosen)
      footnotes.push(
        `Round ${roundNumber}: ${chosen.name} plays ${POSITION_NAMES[position]} and also hits, ` +
          `because nobody else available can play there. Cover her spot during her at-bat.`,
      )
    } else {
      blockers.push(
        `Round ${roundNumber}: nobody available can play ${POSITION_NAMES[position]}. ` +
          `Change a rating or add a goal, then try again.`,
      )
    }

    if (isOutfield) outfieldersStillNeeded -= 1
  }

  return { field, footnotes, blockers }
}

// Builds every round of the practice.
//
// hittingSides is the list of groups that take turns at bat: the teams in
// two-team and three-team mode, the fixed hitting groups in single-field
// mode. In every mode the rule is the same: one side hits, and everyone else
// who is present is available for the defense.
export function buildRounds(
  presentPlayers: Player[],
  hittingSides: Player[][],
  battingOrders: string[][],
  session: Session,
): RoundsResult {
  const roundCount = Math.floor(session.minutesAvailable / session.minutesPerRound)

  const rounds: Round[] = []
  const footnotes: string[] = []
  const roundsFielded = new Map<string, number>()

  // Where each side's batting order picks up next time it hits.
  const nextBatterIndex: number[] = hittingSides.map(() => 0)

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
    const sideIndex = roundIndex % hittingSides.length
    const hittingSide = hittingSides[sideIndex]

    const { batters, nextStartIndex } = pickBatters(
      battingOrders[sideIndex],
      session,
      nextBatterIndex[sideIndex],
    )
    nextBatterIndex[sideIndex] = nextStartIndex

    const defenders = presentPlayers.filter((player) => !hittingSide.includes(player))
    const battersThisRound = hittingSide.filter((player) => batters.includes(player.id))
    const hittingSideNotBatting = hittingSide.filter((player) => !batters.includes(player.id))

    const result = fillField(
      defenders,
      hittingSideNotBatting,
      battersThisRound,
      roundIndex + 1,
      roundsFielded,
    )
    if (result.blockers.length > 0) {
      return { rounds: [], footnotes: [], blockers: result.blockers }
    }

    for (const assignment of result.field) {
      roundsFielded.set(assignment.playerId, (roundsFielded.get(assignment.playerId) ?? 0) + 1)
    }
    footnotes.push(...result.footnotes)
    rounds.push({ field: result.field, batters })
  }

  return { rounds, footnotes, blockers: [] }
}
