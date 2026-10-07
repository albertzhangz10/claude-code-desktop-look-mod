import { atom, read, update } from 'claude-code'
import type { On, PluginOptions } from 'claude-code'

import type { Range, Tab } from '../types'

const tab = atom({ plugin: 'desktop-look', key: 'tab' } as const, 'overview')
const range = atom({ plugin: 'desktop-look', key: 'range' } as const, 'all')

const DAY_MS = 86_400_000
// Dune runs about 188k words, roughly 245k tokens.
const DUNE_TOKENS = 245_000
const ACCENT = '#d97757'
// The built-in /stats heatmap: gray dots for quiet days, four shades in the accent.
const ACCENT_HEX = 0xd97757
const DOT_HEX = 0xc2c0b6
const DEFAULT = 0x01000000
const SHADES = ['░', '▒', '▓', '█']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LABEL_COLUMNS = 4

type Stats = {
  lastComputedDate?: string
  totalSessions?: number
  totalMessages?: number
  firstSessionDate?: string
  longestSession?: { duration: number }
  dailyActivity?: { date: string; messageCount: number; sessionCount: number }[]
  dailyModelTokens?: { date: string; tokensByModel: Record<string, number> }[]
  modelUsage?: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheReadInputTokens: number
      cacheCreationInputTokens: number
    }
  >
  hourCounts?: Record<string, number>
}
export type { Stats }

const RANGES: { key: Range; label: string; days: number | null }[] = [
  { key: 'all', label: 'All time', days: null },
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
]

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const compact = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}b`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}m`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`

  return String(n)
}

const duration = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60

  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

const shortDate = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8))}`

// "claude-opus-4-8" -> "Opus 4.8", "claude-fable-5" -> "Fable 5"
export const modelLabel = (id: string) => {
  const [family = id, ...version] = id.replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-')

  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${version.join('.')}`.trim()
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const toBase64 = (bytes: Uint8Array) => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | (b << 8) | c
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? BASE64[n & 63]! : '='
  }

  return out
}

export const summarize = (stats: Stats, now: number, rangeKey: Range) => {
  const days = RANGES.find(one => one.key === rangeKey)?.days ?? null
  const since = days === null ? '' : isoDay(now - (days - 1) * DAY_MS)
  const activity = (stats.dailyActivity ?? []).filter(day => day.date >= since)
  const active = activity.filter(day => day.messageCount > 0)
  const tokens = (stats.dailyModelTokens ?? []).filter(day => day.date >= since)

  const byModel: Record<string, number> = {}
  for (const day of tokens) {
    for (const [model, count] of Object.entries(day.tokensByModel)) {
      byModel[model] = (byModel[model] ?? 0) + count
    }
  }
  const models = Object.entries(byModel).sort((a, b) => b[1] - a[1])

  const first = days === null ? (stats.firstSessionDate ?? isoDay(now)).slice(0, 10) : since
  const spanDays = Math.max(1, Math.round((Date.parse(isoDay(now)) - Date.parse(first)) / DAY_MS) + 1)

  // Streaks over consecutive active dates; the current one may end today or yesterday.
  const activeDates = new Set(active.map(day => day.date))
  let longestStreak = 0
  let run = 0
  let previous = ''
  for (const date of [...activeDates].sort()) {
    run = previous && Date.parse(date) - Date.parse(previous) === DAY_MS ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
    previous = date
  }
  let currentStreak = 0
  let cursor = Date.parse(isoDay(now))
  if (!activeDates.has(isoDay(cursor))) cursor -= DAY_MS
  while (activeDates.has(isoDay(cursor))) {
    currentStreak += 1
    cursor -= DAY_MS
  }

  const busiest = [...active].sort((a, b) => b.messageCount - a.messageCount)[0]
  const usage = Object.values(stats.modelUsage ?? {})
  const sum = (pick: (one: (typeof usage)[number]) => number) =>
    usage.reduce((total, one) => total + pick(one), 0)

  return {
    sessions:
      days === null
        ? (stats.totalSessions ?? 0)
        : activity.reduce((total, day) => total + day.sessionCount, 0),
    totalTokens: models.reduce((total, [, count]) => total + count, 0),
    favorite: models[0] ? modelLabel(models[0][0]) : '-',
    models,
    activeDays: active.length,
    spanDays,
    longestStreak,
    currentStreak,
    mostActiveDay: busiest ? shortDate(busiest.date) : '-',
    longestSession: stats.longestSession ? duration(stats.longestSession.duration) : '-',
    breakdown: {
      input: sum(one => one.inputTokens),
      output: sum(one => one.outputTokens),
      cacheRead: sum(one => one.cacheReadInputTokens),
      cacheWrite: sum(one => one.cacheCreationInputTokens),
    },
  }
}

// Month labels on top, Mon/Wed/Fri down the side, one column per week, the current week last.
export const heatmap = (stats: Stats, now: number, weeks: number) => {
  const counts = new Map((stats.dailyActivity ?? []).map(day => [day.date, day.messageCount]))
  const busy = [...counts.values()].filter(count => count > 0).sort((a, b) => a - b)
  const cut = (q: number) => busy[Math.floor(q * (busy.length - 1))] ?? 1
  const thresholds = [cut(0.25), cut(0.5), cut(0.75)]
  const start = Date.parse(isoDay(now)) - (new Date(now).getUTCDay() + (weeks - 1) * 7) * DAY_MS
  const columns = LABEL_COLUMNS + weeks
  const rows = 8
  const words = new Uint32Array(columns * rows * 3)
  const put = (row: number, column: number, char: string, color: number) =>
    words.set([char.codePointAt(0)!, color, DEFAULT], (row * columns + column) * 3)

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) put(row, column, ' ', DEFAULT)
  }
  for (const [row, label] of [[2, 'Mon'], [4, 'Wed'], [6, 'Fri']] as const) {
    ;[...label].forEach((char, i) => put(row, i, char, DEFAULT))
  }

  let lastLabelEnd = LABEL_COLUMNS
  for (let week = 0; week < weeks; week++) {
    const weekStart = start + week * 7 * DAY_MS
    const month = new Date(weekStart).getUTCMonth()
    const column = LABEL_COLUMNS + week
    const isNewMonth = week === 0 || new Date(weekStart - 7 * DAY_MS).getUTCMonth() !== month
    if (isNewMonth && column >= lastLabelEnd && column + 3 <= columns) {
      ;[...MONTHS[month]!].forEach((char, i) => put(0, column + i, char, DEFAULT))
      lastLabelEnd = column + 4
    }

    for (let weekday = 0; weekday < 7; weekday++) {
      const at = weekStart + weekday * DAY_MS
      if (at > now) continue
      const count = counts.get(isoDay(at)) ?? 0
      const level = thresholds.filter(threshold => count > threshold).length
      put(1 + weekday, column, count > 0 ? SHADES[level]! : '·', count > 0 ? ACCENT_HEX : DOT_HEX)
    }
  }

  return { cells: toBase64(new Uint8Array(words.buffer)), columns, rows }
}

export const registerWelcome = (on: On, options: PluginOptions) => {
  const name = typeof options.name === 'string' ? options.name.trim() : ''

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (
      e.surface !== 'terminal' ||
      e.props.hasSurvey ||
      e.props.isWorking ||
      (await $.session.turns()) > 0
    ) {
      return next(e)
    }

    let stats: Stats
    try {
      stats = JSON.parse(await $.fs.read(`${await $.env.get('HOME')}/.claude/stats-cache.json`))
    } catch {
      return next(e)
    }

    const { Box, Button, Raster, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const tabKey = await read($, tab)
    const rangeKey = await read($, range)
    const s = summarize(stats, now, rangeKey)
    const inner = Math.min(e.props.bodyColumns - 4, 120)
    const weeks = Math.max(8, Math.min(53, inner - LABEL_COLUMNS))
    const map = heatmap(stats, now, weeks)
    const hasRoomForHeatmap = e.props.maxRows >= 20
    const column = Math.max(28, Math.floor(inner / 2) - 4)
    const tokensOfInputOutput = s.breakdown.input + s.breakdown.output

    const pair = (left: string, right: string) => (
      <Box>
        <Box width={column}>
          <Text>{left}</Text>
        </Box>
        <Text>{right}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color={ACCENT} bold>
            ✻{' '}
          </Text>
          <Text bold>{name ? `What’s up next, ${name}?` : 'What’s up next?'}</Text>
        </Box>

        <Box marginBottom={1} gap={2}>
          {(['overview', 'models'] as const).map(key =>
            tabKey === key ? (
              <Button
                key={`tab-${key}`}
                label={key === 'overview' ? 'Overview' : 'Models'}
                variant="primary"
                onPress={() => update($, tab, () => key as Tab)}
              />
            ) : (
              <Button
                key={`tab-${key}`}
                label={key === 'overview' ? 'Overview' : 'Models'}
                plain
                dimColor
                onPress={() => update($, tab, () => key as Tab)}
              />
            ),
          )}
        </Box>

        {hasRoomForHeatmap && (
          <Box flexDirection="column" marginBottom={1}>
            <Raster key="heatmap" columns={map.columns} rows={map.rows} cells={map.cells} />
            <Box marginLeft={LABEL_COLUMNS}>
              <Text dimColor>Less </Text>
              <Text color={ACCENT}>{SHADES.join(' ')}</Text>
              <Text dimColor> More</Text>
            </Box>
          </Box>
        )}

        <Box marginBottom={1}>
          {RANGES.map((one, i) => (
            <Box key={`range-wrap-${one.key}`}>
              {i > 0 && <Text dimColor> · </Text>}
              <Button
                key={`range-${one.key}`}
                label={one.label}
                plain
                dimColor={rangeKey !== one.key}
                onPress={() => update($, range, () => one.key)}
              />
            </Box>
          ))}
        </Box>

        {tabKey === 'overview' ? (
          <Box flexDirection="column">
            {pair(`Favorite model: ${s.favorite}`, `Total tokens: ${compact(s.totalTokens)}`)}
            {pair(`Sessions: ${s.sessions.toLocaleString('en-US')}`, `Longest session: ${s.longestSession}`)}
            {pair(`Active days: ${s.activeDays}/${s.spanDays}`, `Longest streak: ${s.longestStreak} days`)}
            {pair(`Most active day: ${s.mostActiveDay}`, `Current streak: ${s.currentStreak} days`)}
            {rangeKey === 'all' && (
              <Text dimColor>
                Input {compact(s.breakdown.input)} · Output {compact(s.breakdown.output)} · Cache read{' '}
                {compact(s.breakdown.cacheRead)} · Cache write {compact(s.breakdown.cacheWrite)}
              </Text>
            )}
          </Box>
        ) : (
          <Box flexDirection="column">
            {s.models.length === 0 && <Text dimColor>No model usage in this range.</Text>}
            {s.models.slice(0, 6).map(([model, count]) => {
              const share = s.totalTokens === 0 ? 0 : count / s.totalTokens
              const barRoom = Math.max(10, Math.min(40, inner - 34))
              const bar = Math.max(1, Math.round(share * barRoom))

              return (
                <Box key={model}>
                  <Box width={16}>
                    <Text>{modelLabel(model)}</Text>
                  </Box>
                  <Text color={ACCENT}>{'█'.repeat(bar)}</Text>
                  <Text color="#c2c0b6">{'·'.repeat(Math.max(0, barRoom - bar))}</Text>
                  <Text dimColor>
                    {'  '}
                    {compact(count).padStart(6)} {String(Math.round(share * 100)).padStart(3)}%
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}

        {rangeKey === 'all' && tokensOfInputOutput > 0 && (
          <Box marginTop={1}>
            <Text dimColor>
              Your input and output are ~
              {Math.round(tokensOfInputOutput / DUNE_TOKENS).toLocaleString('en-US')}x the tokens in
              Dune
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
