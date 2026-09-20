// Decides which of the three practice modes to run and splits the players
// into teams. This exists as its own module because everything else the
// solver does depends on it: the mode is picked before anyone is assigned
// anywhere. The rules come from "The three modes" in docs/PLANNING.md,
// under "How the mode is picked" and "How players are split into teams".
import type { Mode } from './solver'
import type { Player, Position, PositionRating } from './types'

// Two teams means each side fields a defense alone, and playable needs eight.
const MIN_PLAYERS_FOR_TWO_TEAMS = 16

// Twelve or fewer runs single-field. Ellie runs three small teams from 13 up.
const MIN_PLAYERS_FOR_THREE_TEAMS = 13

const INFIELD_POSITIONS: Position[] = ['1B', '2B', '3B', 'SS']
const OUTFIELD_POSITIONS: Position[] = ['LF', 'CF', 'RF']

// Best first. Never is left out on purpose: it means "not an option".
const USABLE_RATINGS: PositionRating[] = ['Starter', 'Backup', 'EmergencyOnly']

type PositionGroup = 'pitcher' | 'catcher' | 'infield' | 'outfield'

// The order the groups are dealt out in.
const GROUP_ORDER: PositionGroup[] = ['pitcher', 'catcher', 'infield', 'outfield']

export interface ModeAndTeams {
  mode: Mode

  // Empty in single-field mode, which has no teams at all.
  teams: Player[][]
}

// Which group a player is dealt out with. Anyone rated to pitch is a pitcher
// (planning doc, soft objective 2). Everyone else goes with the group she is
// rated best at; a tie goes to catcher, then infield, then outfield.
function positionGroupOf(player: Player): PositionGroup {
  if (player.ratings.P !== 'Never') return 'pitcher'

  for (const rating of USABLE_RATINGS) {
    if (player.ratings.C === rating) return 'catcher'

    const playsInfieldAtThisLevel = INFIELD_POSITIONS.some(
      (position) => player.ratings[position] === rating,
    )
    if (playsInfieldAtThisLevel) return 'infield'

    const playsOutfieldAtThisLevel = OUTFIELD_POSITIONS.some(
      (position) => player.ratings[position] === rating,
    )
    if (playsOutfieldAtThisLevel) return 'outfield'
  }

  // Rated Never everywhere. She still needs a team; deal her out last.
  return 'outfield'
}

// Deals players out one at a time, going around the teams: all the pitchers,
// then the catchers, then the infielders, then the outfielders. That spreads
// every group evenly and keeps team sizes within one of each other. Nothing
// else is balanced — not talent, not batting slots.
export function dealIntoTeams(players: Player[], teamCount: number): Player[][] {
  const dealingOrder: Player[] = []
  for (const group of GROUP_ORDER) {
    for (const player of players) {
      if (positionGroupOf(player) === group) dealingOrder.push(player)
    }
  }

  const teams: Player[][] = []
  for (let i = 0; i < teamCount; i++) teams.push([])

  dealingOrder.forEach((player, index) => {
    teams[index % teamCount].push(player)
  })
  return teams
}

// One spot in a playable defense, and the positions that can fill it. The two
// outfield spots accept any outfield position, because playable only asks for
// "at least two outfielders", not specific ones.
interface DefenseSpot {
  label: string
  positions: Position[]
}

const PLAYABLE_DEFENSE: DefenseSpot[] = [
  { label: 'P', positions: ['P'] },
  { label: 'C', positions: ['C'] },
  { label: '1B', positions: ['1B'] },
  { label: '2B', positions: ['2B'] },
  { label: '3B', positions: ['3B'] },
  { label: 'SS', positions: ['SS'] },
  { label: 'first outfielder', positions: OUTFIELD_POSITIONS },
  { label: 'second outfielder', positions: OUTFIELD_POSITIONS },
]

function canFill(player: Player, spot: DefenseSpot): boolean {
  return spot.positions.some((position) => player.ratings[position] !== 'Never')
}

// Can this group of players cover a playable defense by themselves, with
// nobody at a position she is rated Never? Emergency only counts as covered.
//
// Greedy, no search: always fill the hardest spot next (the one the fewest
// remaining players can cover), and give it to the player who is useful in
// the fewest other spots, so flexible players are saved for later.
function canFieldPlayableDefense(players: Player[]): boolean {
  let openSpots = [...PLAYABLE_DEFENSE]
  let availablePlayers = [...players]

  while (openSpots.length > 0) {
    let hardestSpot = openSpots[0]
    let hardestSpotCandidates = availablePlayers.filter((player) =>
      canFill(player, hardestSpot),
    )
    for (const spot of openSpots) {
      const candidates = availablePlayers.filter((player) => canFill(player, spot))
      if (candidates.length < hardestSpotCandidates.length) {
        hardestSpot = spot
        hardestSpotCandidates = candidates
      }
    }

    if (hardestSpotCandidates.length === 0) return false

    let leastFlexible = hardestSpotCandidates[0]
    let leastFlexibleCount = openSpots.length + 1
    for (const candidate of hardestSpotCandidates) {
      const spotsSheCouldFill = openSpots.filter((spot) => canFill(candidate, spot)).length
      if (spotsSheCouldFill < leastFlexibleCount) {
        leastFlexible = candidate
        leastFlexibleCount = spotsSheCouldFill
      }
    }

    const filledSpot = hardestSpot
    const chosenPlayer = leastFlexible
    openSpots = openSpots.filter((spot) => spot !== filledSpot)
    availablePlayers = availablePlayers.filter((player) => player !== chosenPlayer)
  }

  return true
}

// Prefers the biggest teams that actually work: two teams if each side can
// field a defense alone, otherwise three teams, otherwise single-field.
export function pickModeAndTeams(presentPlayers: Player[]): ModeAndTeams {
  if (presentPlayers.length >= MIN_PLAYERS_FOR_TWO_TEAMS) {
    const twoTeams = dealIntoTeams(presentPlayers, 2)
    const bothSidesPlayable = twoTeams.every((team) => canFieldPlayableDefense(team))
    if (bothSidesPlayable) return { mode: 'twoTeams', teams: twoTeams }
  }

  if (presentPlayers.length >= MIN_PLAYERS_FOR_THREE_TEAMS) {
    return { mode: 'threeTeams', teams: dealIntoTeams(presentPlayers, 3) }
  }

  return { mode: 'singleField', teams: [] }
}
