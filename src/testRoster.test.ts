// Sanity checks on the fake roster itself, so every later solver test can
// trust its fixture. Not solver tests — those come with ELL-226.
import { describe, expect, it } from 'vitest'
import { POSITIONS } from './types'
import { TEST_ROSTER } from './testRoster'

describe('test roster', () => {
  it('has fifteen players', () => {
    expect(TEST_ROSTER).toHaveLength(15)
  })

  it('rates every player at every position, with no blanks', () => {
    for (const player of TEST_ROSTER) {
      for (const position of POSITIONS) {
        expect(player.ratings[position]).toBeDefined()
      }
    }
  })

  it('gives every player a unique id', () => {
    const ids = TEST_ROSTER.map((player) => player.id)
    expect(new Set(ids).size).toBe(TEST_ROSTER.length)
  })
})
