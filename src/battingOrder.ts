// Builds one side's batting order. It exists as its own module because the
// order has its own small set of rules, applied in a fixed sequence: goals
// first, default slots second, everyone else last. See soft objective 4 in
// docs/PLANNING.md ("Default batting slots, applied last").
import type { Goal, Player } from './types'

// A number that depends only on the date and the player. Used to settle ties
// between two players with the same default slot: whoever gets the lower
// number wins. Same date, same answer every time, so re-running the solver
// after a manual edit never reshuffles the order; a different date gives a
// different answer, so over a season it evens out.
function tieBreakNumber(date: string, playerId: string): number {
  const text = `${date}|${playerId}`
  let total = 7
  for (let i = 0; i < text.length; i++) {
    total = (total * 31 + text.charCodeAt(i)) % 1000003
  }
  return total
}

export function buildBattingOrder(players: Player[], goals: Goal[], date: string): string[] {
  const hitters = players.filter((player) => player.hits)
  const spots: (string | null)[] = hitters.map(() => null)

  // 1. Anyone with a maximize-at-bats goal goes to the top, highest-priority
  //    goal first, so she comes around more often. Goals outrank slots.
  const movedUp: Player[] = []
  for (const goal of goals) {
    const hitter = hitters.find((player) => player.id === goal.playerId)
    if (goal.verb === 'MaximizeAtBats' && hitter && !movedUp.includes(hitter)) {
      spots[movedUp.length] = hitter.id
      movedUp.push(hitter)
    }
  }

  // 2. Players with a default slot, lowest slot first, ties settled by date.
  const withSlot = hitters.filter(
    (player) => player.defaultBattingSlot !== undefined && !movedUp.includes(player),
  )
  withSlot.sort((a, b) => {
    const slotDifference = (a.defaultBattingSlot ?? 0) - (b.defaultBattingSlot ?? 0)
    if (slotDifference !== 0) return slotDifference
    return tieBreakNumber(date, a.id) - tieBreakNumber(date, b.id)
  })

  // Players with slots always stay in slot order relative to each other: a
  // 6-hole hitter never ends up behind a 9-hole hitter. Two passes.
  //
  // Forward: each takes her own spot, or the spot right after the previous
  // slotted player if that is later. Two players who both hit 4th come out
  // 4th and 5th.
  const spotFor: number[] = []
  let earliestAllowed = movedUp.length
  for (const player of withSlot) {
    const wanted = (player.defaultBattingSlot ?? 1) - 1
    const spot = Math.max(wanted, earliestAllowed)
    spotFor.push(spot)
    earliestAllowed = spot + 1
  }

  // Backward: if that ran off the end of the order, slide players back up
  // just far enough to fit. A slot bigger than the order (9 on a side with 8
  // hitters) therefore means last, and two 9s come out last and next to last.
  let latestAllowed = spots.length - 1
  for (let i = withSlot.length - 1; i >= 0; i--) {
    spotFor[i] = Math.min(spotFor[i], latestAllowed)
    latestAllowed = spotFor[i] - 1
  }

  withSlot.forEach((player, i) => {
    spots[spotFor[i]] = player.id
  })

  // 3. Everyone else fills whatever spots are left, in the order they were
  //    dealt. A missing slot is never a penalty: these may be early spots.
  const withoutSlot = hitters.filter(
    (player) => player.defaultBattingSlot === undefined && !movedUp.includes(player),
  )
  for (const player of withoutSlot) {
    spots[spots.indexOf(null)] = player.id
  }

  return spots.filter((id): id is string => id !== null)
}
