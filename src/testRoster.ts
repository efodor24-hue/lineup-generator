// A hardcoded, fictional 15-player roster that every solver test runs against
// (build stage 1 in docs/PLANNING.md). This is not the real team — it exists
// so tests have a realistic spread to chew on: three pitchers, one of whom
// does not bat, a thin first base, utility players, and a few default
// batting slots. The shape deliberately matches the behavior scenarios in
// the planning doc, which name situations like "only one player rated at
// first base" and "three available pitchers".
import type { Player, Position, PositionRating } from './types'
import { POSITIONS } from './types'

// Start every position at Never and apply only the exceptions — the same way
// the coach fills in a real player (see "Position ratings" in the planning doc).
function ratings(
  overrides: Partial<Record<Position, PositionRating>>,
): Record<Position, PositionRating> {
  const all = {} as Record<Position, PositionRating>
  for (const position of POSITIONS) {
    all[position] = overrides[position] ?? 'Never'
  }
  return all
}

export const TEST_ROSTER: Player[] = [
  // --- Pitchers (three of them, so pitcher-equality scenarios can run) ---
  {
    // Ace pitcher who does not bat — the "non-hitters are still included" case.
    id: 'harper',
    name: 'Harper',
    ratings: ratings({ P: 'Starter' }),
    hits: false,
  },
  {
    id: 'quinn',
    name: 'Quinn',
    ratings: ratings({ P: 'Starter', RF: 'Backup' }),
    hits: true,
  },
  {
    id: 'reese',
    name: 'Reese',
    ratings: ratings({ P: 'Backup', LF: 'Backup' }),
    hits: true,
  },

  // --- Catchers ---
  {
    id: 'delaney',
    name: 'Delaney',
    ratings: ratings({ C: 'Starter', '3B': 'EmergencyOnly' }),
    hits: true,
  },
  {
    id: 'rowan',
    name: 'Rowan',
    ratings: ratings({ C: 'Backup', '1B': 'EmergencyOnly' }),
    hits: true,
  },

  // --- Infield. First base is deliberately thin: Maya is the only player
  // --- rated above EmergencyOnly there, which the compromise-flag scenario needs.
  {
    id: 'maya',
    name: 'Maya',
    ratings: ratings({ '1B': 'Starter' }),
    defaultBattingSlot: 3,
    hits: true,
  },
  {
    id: 'emerson',
    name: 'Emerson',
    ratings: ratings({ '2B': 'Starter', SS: 'Backup' }),
    hits: true,
  },
  {
    // Mia and Sydney can both play shortstop — the goal-conflict scenario pair.
    id: 'mia',
    name: 'Mia',
    ratings: ratings({ SS: 'Starter', '2B': 'Backup' }),
    defaultBattingSlot: 2,
    hits: true,
  },
  {
    id: 'sydney',
    name: 'Sydney',
    ratings: ratings({ '3B': 'Starter', SS: 'Backup' }),
    defaultBattingSlot: 4,
    hits: true,
  },
  {
    // Utility infielder.
    id: 'jordan',
    name: 'Jordan',
    ratings: ratings({
      '2B': 'Backup',
      '3B': 'Backup',
      SS: 'Backup',
      '1B': 'EmergencyOnly',
    }),
    hits: true,
  },

  // --- Outfield ---
  {
    id: 'kennedy',
    name: 'Kennedy',
    ratings: ratings({ CF: 'Starter', LF: 'Backup', RF: 'Backup' }),
    defaultBattingSlot: 1,
    hits: true,
  },
  {
    id: 'avery',
    name: 'Avery',
    ratings: ratings({ LF: 'Starter', CF: 'Backup' }),
    hits: true,
  },
  {
    id: 'brooklyn',
    name: 'Brooklyn',
    ratings: ratings({ RF: 'Starter', CF: 'EmergencyOnly' }),
    hits: true,
  },
  {
    // Utility outfielder.
    id: 'peyton',
    name: 'Peyton',
    ratings: ratings({
      LF: 'Backup',
      CF: 'Backup',
      RF: 'Backup',
      '2B': 'EmergencyOnly',
    }),
    hits: true,
  },
  {
    // True utility: outfield backup plus the emergency catcher.
    id: 'riley',
    name: 'Riley',
    ratings: ratings({
      LF: 'Backup',
      RF: 'Backup',
      C: 'EmergencyOnly',
      '1B': 'EmergencyOnly',
    }),
    hits: true,
  },
]
