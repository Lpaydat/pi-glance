# Fork pi-glance with fixed-editor support from pi-powerline-footer

## Goal
Add fixed-bottom editor mode to pi-glance by porting `TerminalSplitCompositor` from pi-powerline-footer.

## Architecture
- Copy `fixed-editor/cluster.ts` (113 lines) and `fixed-editor/terminal-split.ts` (1077 lines) from pi-powerline-footer into pi-glance
- Copy `shortcuts.ts` (47 lines) or inline the `matchesConfiguredShortcut` function
- Add `fixedEditor` and `mouseScroll` config options to GlanceConfig
- Wire compositor in `installInputSurface()` — after editor+footer setup, optionally install compositor
- Add keyboard shortcuts for chat scrolling (configurable)
- Handle lifecycle: install on session_start, teardown on session_shutdown
- All original MIT attribution preserved

## Files created
1. `/home/lpaydat/workspace/pi-glance/fixed-editor/cluster.ts` — from powerline-footer, import path updated to `@mariozechner/pi-tui`
2. `/home/lpaydat/workspace/pi-glance/fixed-editor/terminal-split.ts` — from powerline-footer, imports fixed (`.js` extensions, `@mariozechner/pi-tui`)
3. `/home/lpaydat/workspace/pi-glance/shortcuts.ts` — from powerline-footer, import path + type cast fix

## Files modified
4. `types.ts` — added `FixedEditorConfig` interface + `fixedEditor` field to `GlanceConfig`
5. `config.ts` — added `fixedEditor` defaults (enabled: false, mouseScroll: true, scrollUp/Down: super+up/down), normalization, cloning
6. `index.ts` — full rewrite with compositor lifecycle (`installFixedEditorCompositor`/`teardownFixedEditorCompositor`), `/glance-fixed-editor` command, lifecycle hooks

## Skipped
7. `pane.ts` — not modified; fixed-editor is config-only for now (edit config.json or use `/glance-fixed-editor` command)

## Checklist
- [x] Copy cluster.ts
- [x] Copy terminal-split.ts (fix imports)
- [x] Copy shortcuts.ts
- [x] Update types.ts with new config fields
- [x] Update config.ts with defaults
- [x] Wire compositor in index.ts (install/teardown lifecycle)
- [x] Test build: `npm run check`
- [x] Verify no type errors — `tsc --noEmit` returns zero errors

## Installation
- Installed as symlink: `~/.pi/agent/npm/node_modules/pi-glance → ~/workspace/pi-glance`
- Config at `~/.pi/agent/pi-glance/config.json` has `fixedEditor.enabled: true`
- Needs pi session restart to load the forked extension
