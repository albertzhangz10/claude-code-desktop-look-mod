import { expect, test } from 'claude-code/testing'

import { heatmap, modelLabel, summarize } from './welcome'
import type { Stats } from './welcome'

const STATS: Stats = {
  totalSessions: 162,
  firstSessionDate: '2026-09-01T10:00:00Z',
  dailyActivity: [
    { date: '2026-09-01', messageCount: 100, sessionCount: 2 },
    { date: '2026-10-05', messageCount: 40, sessionCount: 1 },
    { date: '2026-10-06', messageCount: 10, sessionCount: 1 },
    { date: '2026-10-07', messageCount: 5, sessionCount: 1 },
  ],
  dailyModelTokens: [
    { date: '2026-09-01', tokensByModel: { 'claude-opus-4-8': 1000 } },
    { date: '2026-10-05', tokensByModel: { 'claude-opus-5': 3000 } },
  ],
}
const NOW = Date.parse('2026-10-07T12:00:00Z')

test('All uses lifetime totals and finds the streaks', async () => {
  const s = summarize(STATS, NOW, 'all')
  expect(s.sessions).toBe(162)
  expect(s.totalTokens).toBe(4000)
  expect(s.favorite).toBe('Opus 5')
  expect(s.activeDays).toBe(4)
  expect(s.spanDays).toBe(37)
  expect(s.longestStreak).toBe(3)
  expect(s.currentStreak).toBe(3)
  expect(s.mostActiveDay).toBe('Sep 1')
})

test('Last 7 days counts only that week', async () => {
  const s = summarize(STATS, NOW, '7d')
  expect(s.sessions).toBe(3)
  expect(s.totalTokens).toBe(3000)
  expect(s.spanDays).toBe(7)
})

test('model ids read like the built-in stats', async () => {
  expect(modelLabel('claude-opus-4-8')).toBe('Opus 4.8')
  expect(modelLabel('claude-fable-5')).toBe('Fable 5')
})

test('the heatmap packs one triplet per Raster cell', async () => {
  const map = heatmap(STATS, NOW, 53)
  expect(map.columns).toBe(57)
  expect(map.rows).toBe(8)
  expect(map.cells.length).toBe(Math.ceil((map.columns * map.rows * 12) / 3) * 4)
})
