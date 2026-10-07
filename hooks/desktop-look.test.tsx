import { wrap } from './register'
import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'desktop-look-changes',
  props: {
    title: 'Changes',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the Changes sidebar starts empty on terminal and desktop', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'desktop-look', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /No files changed yet/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a Bash call draws as one compact row on the terminal', async $ => {
  const ui = await $.ui.mount({
    plugin: 'desktop-look',
    surface: 'terminal',
    component: 'ToolUse',
    props: {
      tool_use_id: 'toolu_test',
      tool: 'Bash',
      input: { command: 'ls -la', description: 'List files' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    },
  })
  expect(await ui.find({ type: 'Text', text: /List files/ })).toBeDefined()
  await ui.unmount()
})

test('a prompt wraps inside the bubble and keeps its line breaks', async () => {
  expect(wrap('add radius to the message i send', 12)).toEqual(['add radius', 'to the', 'message i', 'send'])
  expect(wrap('one\ntwo', 20)).toEqual(['one', 'two'])
  expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
})

test('a typed prompt draws as a bubble on the terminal', async $ => {
  const ui = await $.ui.mount({
    plugin: 'desktop-look',
    surface: 'terminal',
    component: 'UserMessage',
    viewport: { columns: 100, rows: 40 },
    props: { text: 'hello there', origin: { kind: 'composer' }, isExpanded: false },
  })
  expect(await ui.find({ type: 'Text', text: /hello there/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\u{1FB47}/u })).toBeDefined()
  await ui.unmount()
})
