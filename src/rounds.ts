// Builds the rounds of a practice: who is in the field and who bats, round by
// round. This is where the three hard rules are enforced (see "Hard rules" in
// docs/PLANNING.md): nobody in two places, everyone plays, and the field is
// playable every round. It is also where the coach's goals are honored, in
// priority order, without ever breaking those rules. Even pitching and even
// rest are layered on later (ELL-232).
import type { AssignmentFlag, FieldAssignment, Round, UnmetGoal } from './solver'
import type { Goal, Player, Position, PositionRating, Session } from './types'

const INFIELD_AND_BATTERY: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS']
const OUTFIELD_POSITIONS: Position[] = ['LF', 'CF', 'RF']
const ALL_POSITIONS: Position[] = [...INFIELD_AND_BATTERY, ...OUTFIELD_POSITIONS]

// Playable needs at least this many outfielders. The third is filled whenever
// there is someone to fill it.
const REQUIRED_OUTFIELDERS = 2

// Lower is better.
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
  unmetGoals: UnmetGoal[]

  // Reasons no lineup could be built. When this is not empty, rounds is.
  blockers: string[]
}

// Does a "fields at" goal put this player at this position? Ratings guide the
// solver, but the coach's stated intent outranks them, even a Never.
function hasGoalFor(player: Player, position: Position, goals: Goal[]): boolean {
  return goals.some(
    (goal) =>
      goal.verb === 'FieldsAt' && goal.playerId === player.id && goal.position === position,
  )
}

// Can the solver put her here? Yes if she is rated anything but Never, or if
// a goal says so.
function canPlay(player: Player, position: Position, goals: Goal[]): boolean {
  return player.ratings[position] !== 'Never' || hasGoalFor(player, position, goals)
}

// Why an assignment gets an asterisk, if it does. See "Position ratings" in
// the planning doc: Emergency only is always flagged, and so is a Never that
// a goal overruled.
function ratingFlag(player: Player, position: Position): AssignmentFlag | undefined {
  if (player.ratings[position] === 'Never') return 'overrodeNever'
  if (player.ratings[position] === 'EmergencyOnly') return 'emergencyOnly'
  return undefined
}

// Before building anything: is there a required position that nobody present
// can cover at all? If so the solver stops and says which one, rather than
// quietly putting someone there. (Decided with Ellie, ELL-228.)
export function findUncoverablePositions(presentPlayers: Player[], goals: Goal[]): string[] {
  const blockers: string[] = []

  for (const position of INFIELD_AND_BATTERY) {
    const someoneCanPlayIt = presentPlayers.some((player) => canPlay(player, position, goals))
    if (!someoneCanPlayIt) {
      blockers.push(
        `Nobody at practice today is rated to play ${POSITION_NAMES[position]}. ` +
          `Change a rating or add a goal, then try again.`,
      )
    }
  }

  const outfielders = presentPlayers.filter((player) =>
    OUTFIELD_POSITIONS.some((position) => canPlay(player, position, goals)),
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
  goals: Goal[],
): Player {
  function sortKey(player: Player): number[] {
    const getsInFirst = mustGetInHere(player, position, roundsFielded) ? 0 : 1
    const ratingRank = RATING_RANK[player.ratings[position]]
    const otherSpotsSheCouldFill = otherOpenPositions.filter((other) =>
      canPlay(player, other, goals),
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

// What the goals have settled for one round before the rest of the field is
// filled in: who is locked into a position, and who is sitting this one out.
interface GoalDecisions {
  placements: { player: Player; position: Position }[]
  sitting: Player[]
}

interface FieldResult {
  field: FieldAssignment[]

  // Required positions nobody could be found for. Empty when the field works.
  unfilledPositions: Position[]
}

// Everyone on the hitting side, split by whether she is batting this round.
interface HittingSide {
  notBatting: Player[]
  batting: Player[]
}

// Fills the field for one round, around whatever the goals have settled.
//
// Greedy, no search: always fill the hardest open position next (the one the
// fewest available defenders can play). If nobody on the defense can play a
// required position, look to the hitting side: first someone who is not
// batting this round, and as a last resort someone who is — the mid-round
// split, which is flagged. See "The mid-round split" in the planning doc.
function fillField(
  defenders: Player[],
  hittingSide: HittingSide,
  decisions: GoalDecisions,
  roundsFielded: Map<string, number>,
  goals: Goal[],
): FieldResult {
  const field: FieldAssignment[] = []

  // Start with what the goals locked in.
  for (const placement of decisions.placements) {
    field.push({
      playerId: placement.player.id,
      position: placement.position,
      flag: ratingFlag(placement.player, placement.position),
    })
  }
  const lockedPlayers = decisions.placements.map((placement) => placement.player)
  const lockedPositions = decisions.placements.map((placement) => placement.position)

  let openPositions = ALL_POSITIONS.filter((position) => !lockedPositions.includes(position))
  let availableDefenders = defenders.filter(
    (player) => !lockedPlayers.includes(player) && !decisions.sitting.includes(player),
  )

  // Pass one: the defense itself, hardest position first.
  while (true) {
    let hardestPosition: Position | null = null
    let hardestCandidates: Player[] = []
    for (const position of openPositions) {
      const candidates = availableDefenders.filter((player) => canPlay(player, position, goals))
      if (candidates.length === 0) continue
      if (hardestPosition === null || candidates.length < hardestCandidates.length) {
        hardestPosition = position
        hardestCandidates = candidates
      }
    }
    if (hardestPosition === null) break

    const position = hardestPosition
    const otherOpenPositions = openPositions.filter((open) => open !== position)
    const chosen = bestCandidate(
      hardestCandidates,
      position,
      otherOpenPositions,
      roundsFielded,
      goals,
    )
    field.push({ playerId: chosen.id, position, flag: ratingFlag(chosen, position) })
    openPositions = openPositions.filter((open) => open !== position)
    availableDefenders = availableDefenders.filter((player) => player !== chosen)
  }

  // Pass two: required positions the defense could not cover.
  const outfieldersPlaced = field.filter((assignment) =>
    OUTFIELD_POSITIONS.includes(assignment.position),
  ).length
  let outfieldersStillNeeded = Math.max(0, REQUIRED_OUTFIELDERS - outfieldersPlaced)

  let availableNotBatting = [...hittingSide.notBatting]
  let availableBatters = [...hittingSide.batting]
  const unfilledPositions: Position[] = []

  for (const position of openPositions) {
    const isOutfield = OUTFIELD_POSITIONS.includes(position)
    if (isOutfield && outfieldersStillNeeded === 0) continue // the optional third outfielder

    const notBattingCandidates = availableNotBatting.filter((player) =>
      canPlay(player, position, goals),
    )
    const battingCandidates = availableBatters.filter((player) =>
      canPlay(player, position, goals),
    )

    if (notBattingCandidates.length > 0) {
      // Borrowed: on the hitting side but not up this round, so she is free
      // to field. Flagged, because she is fielding for the other side.
      const chosen = bestCandidate(notBattingCandidates, position, [], roundsFielded, goals)
      field.push({ playerId: chosen.id, position, flag: 'borrowed' })
      availableNotBatting = availableNotBatting.filter((player) => player !== chosen)
    } else if (battingCandidates.length > 0) {
      // The mid-round split: she fields and hits in the same round.
      const chosen = bestCandidate(battingCandidates, position, [], roundsFielded, goals)
      field.push({ playerId: chosen.id, position, flag: 'midRoundSplit' })
      availableBatters = availableBatters.filter((player) => player !== chosen)
    } else {
      unfilledPositions.push(position)
    }

    if (isOutfield) outfieldersStillNeeded -= 1
  }

  return { field, unfilledPositions }
}

// A goal is only kept for a round if the field still works with it: nothing
// required is left empty. "A goal never breaks the field" in the planning
// doc. A goal is allowed to cause a flagged compromise elsewhere, even a
// mid-round split, because the coach's stated intent outranks the solver's
// preferences; it is just never allowed to leave a hole.
function isNoWorseThan(trial: FieldResult, current: FieldResult): boolean {
  return trial.unfilledPositions.length <= current.unfilledPositions.length
}

// Remembers, goal by goal, the rounds where a goal could not be honored and why.
type UnmetLog = Map<Goal, { roundNumber: number; reason: string }[]>

function noteUnmet(log: UnmetLog, goal: Goal, roundNumber: number, reason: string): void {
  const entries = log.get(goal) ?? []
  entries.push({ roundNumber, reason })
  log.set(goal, entries)
}

function listRounds(roundNumbers: number[]): string {
  const label = roundNumbers.length === 1 ? 'round' : 'rounds'
  return `${label} ${roundNumbers.join(', ')}`
}

// Turns the log into the plain-language notes that live with the goal list.
function describeUnmetGoals(goals: Goal[], log: UnmetLog): UnmetGoal[] {
  const unmetGoals: UnmetGoal[] = []
  for (const goal of goals) {
    const entries = log.get(goal)
    if (!entries) continue

    const reasons = [...new Set(entries.map((entry) => entry.reason))]
    const parts = reasons.map((reason) => {
      const roundNumbers = entries
        .filter((entry) => entry.reason === reason)
        .map((entry) => entry.roundNumber)
      return `${reason} (${listRounds(roundNumbers)})`
    })
    unmetGoals.push({ goal, reason: parts.join('; ') })
  }
  return unmetGoals
}

// One footnote per flagged player and position, listing every round it
// happened in, so the coach reads one line instead of seven.
function describeFlags(rounds: Round[], presentPlayers: Player[]): string[] {
  const roundsByKey = new Map<string, number[]>()
  rounds.forEach((round, roundIndex) => {
    for (const assignment of round.field) {
      if (!assignment.flag) continue
      const key = `${assignment.playerId}|${assignment.position}|${assignment.flag}`
      const roundNumbers = roundsByKey.get(key) ?? []
      roundNumbers.push(roundIndex + 1)
      roundsByKey.set(key, roundNumbers)
    }
  })

  const footnotes: string[] = []
  for (const [key, roundNumbers] of roundsByKey) {
    const [playerId, position, flag] = key.split('|') as [string, Position, AssignmentFlag]
    const name = presentPlayers.find((player) => player.id === playerId)?.name ?? playerId
    const where = `${name} at ${POSITION_NAMES[position]}, ${listRounds(roundNumbers)}`

    if (flag === 'emergencyOnly') {
      footnotes.push(`* ${where}: she is rated Emergency only there.`)
    } else if (flag === 'overrodeNever') {
      footnotes.push(`* ${where}: she is rated Never there. A goal put her there.`)
    } else if (flag === 'borrowed') {
      footnotes.push(
        `* ${where}: borrowed from the hitting side, because nobody on the defense can play there. ` +
          `She is not batting in ${roundNumbers.length === 1 ? 'that round' : 'those rounds'}.`,
      )
    } else {
      footnotes.push(
        `* ${where}: she also hits, because nobody else available can play there. ` +
          `Cover her spot during her at-bat.`,
      )
    }
  }
  return footnotes
}

// Builds every round of the practice.
//
// hittingSides is the list of groups that take turns at bat: the teams in
// two-team and three-team mode, the fixed hitting groups in single-field
// mode. In every mode the rule is the same: one side hits, and everyone else
// who is present is available for the defense.
//
// goals is the coach's list, highest priority first. Maximize at-bats is
// handled by the caller when it builds the batting orders; this function
// handles the two goals that touch the field, "fields at" and "rest".
export function buildRounds(
  presentPlayers: Player[],
  hittingSides: Player[][],
  battingOrders: string[][],
  session: Session,
  goals: Goal[],
): RoundsResult {
  const roundCount = Math.floor(session.minutesAvailable / session.minutesPerRound)

  const rounds: Round[] = []
  const roundsFielded = new Map<string, number>()
  const unmetLog: UnmetLog = new Map()

  // Where each side's batting order picks up next time it hits.
  const nextBatterIndex: number[] = hittingSides.map(() => 0)

  // For a Rest goal: how many rounds so far she could have fielded. She sits
  // out every second one, which comes to about half.
  const chancesToField = new Map<string, number>()

  for (let roundIndex = 0; roundIndex < roundCount; roundIndex++) {
    const roundNumber = roundIndex + 1
    const sideIndex = roundIndex % hittingSides.length
    const sideAtBat = hittingSides[sideIndex]

    const { batters, nextStartIndex } = pickBatters(
      battingOrders[sideIndex],
      session,
      nextBatterIndex[sideIndex],
    )
    nextBatterIndex[sideIndex] = nextStartIndex

    const defenders = presentPlayers.filter((player) => !sideAtBat.includes(player))
    const hittingSide: HittingSide = {
      batting: sideAtBat.filter((player) => batters.includes(player.id)),
      notBatting: sideAtBat.filter((player) => !batters.includes(player.id)),
    }

    // Walk the goals in priority order. Each one is tried on top of the goals
    // already accepted this round, and kept only if the field still works.
    let decisions: GoalDecisions = { placements: [], sitting: [] }
    let current = fillField(defenders, hittingSide, decisions, roundsFielded, goals)

    for (const goal of goals) {
      const player = defenders.find((defender) => defender.id === goal.playerId)
      if (!player) continue // absent, or her side is hitting: nothing to do this round

      const alreadyPlaced = decisions.placements.some((placement) => placement.player === player)
      const alreadySitting = decisions.sitting.includes(player)

      let trial: GoalDecisions | null = null

      if (goal.verb === 'FieldsAt' && goal.position) {
        const position = goal.position
        const positionTaken = decisions.placements.some(
          (placement) => placement.position === position,
        )
        if (positionTaken) {
          noteUnmet(unmetLog, goal, roundNumber, `a higher goal has ${POSITION_NAMES[position]}`)
          continue
        }
        if (alreadyPlaced || alreadySitting) {
          noteUnmet(unmetLog, goal, roundNumber, 'a higher goal already decided her round')
          continue
        }
        trial = {
          placements: [...decisions.placements, { player, position }],
          sitting: decisions.sitting,
        }
      }

      if (goal.verb === 'Rest') {
        const chances = (chancesToField.get(player.id) ?? 0) + 1
        chancesToField.set(player.id, chances)
        const dueToSit = chances % 2 === 0
        if (!dueToSit) continue
        if (alreadyPlaced) {
          noteUnmet(unmetLog, goal, roundNumber, 'a higher goal has her in the field')
          continue
        }
        trial = { placements: decisions.placements, sitting: [...decisions.sitting, player] }
      }

      if (trial === null) continue // maximize at-bats does not touch the field

      const trialResult = fillField(defenders, hittingSide, trial, roundsFielded, goals)
      if (isNoWorseThan(trialResult, current)) {
        decisions = trial
        current = trialResult
      } else {
        noteUnmet(unmetLog, goal, roundNumber, 'she was needed elsewhere to keep the field playable')
      }
    }

    if (current.unfilledPositions.length > 0) {
      const names = current.unfilledPositions.map((position) => POSITION_NAMES[position])
      return {
        rounds: [],
        footnotes: [],
        unmetGoals: [],
        blockers: [
          `Round ${roundNumber}: nobody available can play ${names.join(' or ')}. ` +
            `Change a rating or add a goal, then try again.`,
        ],
      }
    }

    for (const assignment of current.field) {
      roundsFielded.set(assignment.playerId, (roundsFielded.get(assignment.playerId) ?? 0) + 1)
    }
    rounds.push({ field: current.field, batters })
  }

  return {
    rounds,
    footnotes: describeFlags(rounds, presentPlayers),
    unmetGoals: describeUnmetGoals(goals, unmetLog),
    blockers: [],
  }
}
