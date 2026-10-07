import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Change } from '../types'
import { registerWelcome } from './welcome'

const PANE = 'desktop-look-changes'
const changes = atom({ plugin: 'desktop-look', key: 'changes' } as const, [])

// Tools whose own drawing (diffs, questions, plans, todos) carries the content: left alone.
const KEEP_ENGINE_ROW = new Set([
  'Edit',
  'MultiEdit',
  'Write',
  'NotebookEdit',
  'AskUserQuestion',
  'ExitPlanMode',
  'TodoWrite',
])
// The Claude desktop app's light palette.
const TEXT = '#141413'
const SECONDARY = '#3d3d3a'
const MUTED = '#87867f'
const ACCENT = '#d97757'
const USER_BUBBLE = '#f0eee6'
// Symbols for Legacy Computing: strips a third of a row tall, half-cell corner wedges
// that meet them, and half blocks that pull the side edges in to line up with the wedges.
const CORNER = {
  top: '\u{1FB2D}',
  topLeft: '\u{1FB47}',
  topRight: '\u{1FB3C}',
  bottom: '\u{1FB02}',
  bottomLeft: '\u{1FB62}',
  bottomRight: '\u{1FB57}',
  left: '▐',
  right: '▌',
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

// Greedy word wrap that keeps the person's own line breaks and splits overlong words.
export const wrap = (text: string, width: number) => {
  const lines: string[] = []
  for (const paragraph of text.replace(/\t/g, '  ').split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      let rest = word
      while (rest.length > width) {
        if (line) lines.push(line)
        lines.push(rest.slice(0, width))
        rest = rest.slice(width)
        line = ''
      }
      if (!line) line = rest
      else if (line.length + 1 + rest.length <= width) line += ` ${rest}`
      else {
        lines.push(line)
        line = rest
      }
    }
    lines.push(line)
  }

  return lines
}

const shortPath = (path: string) => {
  const parts = path.split('/').filter(Boolean)

  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`
}

const field = (input: unknown, key: string): string | undefined => {
  if (input === null || typeof input !== 'object') {
    return undefined
  }
  const value = (input as Record<string, unknown>)[key]

  return typeof value === 'string' && value.length > 0 ? value : undefined
}

const summarize = (input: unknown): string => {
  const path = field(input, 'file_path') ?? field(input, 'notebook_path')
  if (path) {
    return shortPath(path)
  }

  return (
    field(input, 'description') ??
    field(input, 'command') ??
    field(input, 'pattern') ??
    field(input, 'query') ??
    field(input, 'url') ??
    field(input, 'prompt') ??
    field(input, 'path') ??
    ''
  ).split('\n')[0]!
}

export const register: Register = (on, options) => {
  registerWelcome(on, options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changes',
      description: 'Show the files changed this session in a sidebar, like the desktop app',
    })
    void $.ui.open({ id: PANE, title: 'Changes' })

    return next(e)
  })

  on('command.run', { command: 'changes' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Changes' })

    return { text: 'Changes sidebar opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = field(e, 'file_path') ?? field(e, 'notebook_path')

    if (EDIT_TOOLS.has(e.tool) && path && !('deny' in ran) && !ran.isError) {
      await update($, changes, list => {
        const found = list.find(one => one.path === path)
        if (found) {
          return list.map(one =>
            one.path === path ? { ...one, tool: e.tool, edits: one.edits + 1 } : one,
          )
        }
        const change: Change = { path, tool: e.tool, edits: 1 }

        return [...list, change]
      })
    }

    return ran
  })

  // The person's prompt as a right-aligned bubble. A third-of-a-row strip pads it above
  // and below, and a half-cell wedge at each corner stands for the desktop's 4px radius
  // (at SF Mono 14pt a cell is about 8px wide and 20px tall).
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.origin.kind !== 'composer') {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const columns = e.viewport?.columns ?? 80
    const lines = wrap(e.props.text, Math.max(10, Math.floor(columns * 0.7) - 4))
    const width = Math.max(...lines.map(line => line.length))

    return (
      <Box flexDirection="column" alignItems="flex-end" marginTop={1} marginRight={1}>
        <Text color={USER_BUBBLE}>{`${CORNER.topLeft}${CORNER.top.repeat(width + 2)}${CORNER.topRight}`}</Text>
        {lines.map((line, i) => (
          <Box key={`line-${i}`}>
            <Text color={USER_BUBBLE}>{CORNER.left}</Text>
            <Text color={TEXT} backgroundColor={USER_BUBBLE}>
              {` ${line.padEnd(width)} `}
            </Text>
            <Text color={USER_BUBBLE}>{CORNER.right}</Text>
          </Box>
        ))}
        <Text color={USER_BUBBLE}>
          {`${CORNER.bottomLeft}${CORNER.bottom.repeat(width + 2)}${CORNER.bottomRight}`}
        </Text>
      </Box>
    )
  })

  // Replies as plain text, without the leading bullet.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }
    const { Box, Markdown } = $.ui.resolve(e)

    return (
      <Box marginTop={e.props.isFirstOfReply ? 1 : 0} paddingLeft={1}>
        <Markdown text={e.props.text} />
      </Box>
    )
  })

  // Tool calls as one quiet row each, the way the desktop app collapses them.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || KEEP_ENGINE_ROW.has(e.props.tool) || e.props.isErrored) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)
    const status = e.props.isRunning ? '◌' : e.props.isInterrupted ? '◇' : '◆'

    return (
      <Box paddingLeft={1}>
        <Text color={e.props.isRunning ? ACCENT : MUTED}>{status} </Text>
        <Text bold color={SECONDARY}>
          {e.props.tool}{' '}
        </Text>
        <Text color={MUTED} wrap="truncate-end">
          {summarize(e.props.input)}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, changes)
    const room = Math.max(1, e.props.scroll.bodyRows - 2)

    return (
      <Box flexDirection="column">
        <Text dimColor>
          {list.length === 0 ? 'No files changed yet.' : `${list.length} files changed`}
        </Text>
        {list.slice(-room).map(change => (
          <Box key={change.path}>
            <Text color={change.tool === 'Write' ? 'green' : 'yellow'}>
              {change.tool === 'Write' ? 'A ' : 'M '}
            </Text>
            <Text wrap="truncate-start">{shortPath(change.path)}</Text>
            <Text dimColor> ×{change.edits}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
