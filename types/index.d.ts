export type Change = { path: string; tool: string; edits: number }
export type Tab = 'overview' | 'models'
export type Range = 'all' | '30d' | '7d'

declare module 'claude-code' {
  interface PluginState {
    'desktop-look': { changes: Change[]; tab: Tab; range: Range }
  }
}
