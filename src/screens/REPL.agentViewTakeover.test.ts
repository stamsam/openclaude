import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'

const replSource = readFileSync(new URL('./REPL.tsx', import.meta.url), 'utf8')
const cancelSource = readFileSync(
  new URL('../hooks/useCancelRequest.ts', import.meta.url),
  'utf8',
)
const backgroundNavigationSource = readFileSync(
  new URL('../hooks/useBackgroundTaskNavigation.ts', import.meta.url),
  'utf8',
)
const promptInputSource = readFileSync(
  new URL('../components/PromptInput/PromptInput.tsx', import.meta.url),
  'utf8',
)
const promptFooterSource = readFileSync(
  new URL('../components/PromptInput/PromptInputFooterLeftSide.tsx', import.meta.url),
  'utf8',
)

describe('Agent Dashboard takeover input isolation', () => {
  test('unmounts the main prompt while the fullscreen dashboard is open', () => {
    expect(replSource).toContain(
      '!agentViewOpen && !toolJSX?.shouldHidePromptInput',
    )
  })

  test('disables main chat keybindings while the dashboard owns the screen', () => {
    expect(replSource).toContain(
      'isActive={!agentViewOpen && !toolJSX?.isLocalJSXCommand}',
    )
    expect(replSource).toContain(
      'isActive={!agentViewOpen && isFullscreenEnvEnabled()',
    )
    expect(replSource).toContain('isActive={!agentViewOpen && cursor !== null}')
    expect(replSource).toContain('isActive: !agentViewOpen')
  })

  test('lets REPL-level cancellation and task navigation opt out', () => {
    expect(cancelSource).toContain('isActive?: boolean')
    expect(cancelSource).toContain('if (!isActive) return false')
    expect(backgroundNavigationSource).toContain('isActive?: boolean')
    expect(backgroundNavigationSource).toContain('if (!isActive) return')
  })

  test('releases footer focus after opening an agent transcript', () => {
    expect(promptInputSource).toContain(
      'enterTeammateView(teammate.id, setAppState);\n' +
        '                selectFooterItem(null);',
    )
    expect(promptInputSource).toContain(
      'enterTeammateView(selectedTaskId, setAppState);\n' +
        '              selectFooterItem(null);',
    )
  })

  test('escape returns from a viewed agent even while footer focus is active', () => {
    expect(promptInputSource).toContain(
      "'footer:clearSelection': () => {\n" +
        "      if (viewSelectionMode === 'viewing-agent') {\n" +
        '        exitTeammateView(setAppState);',
    )
  })

  test('shows a return hint while viewing local background agents', () => {
    expect(promptFooterSource).toContain(
      "const isViewingLocalAgent = viewSelectionMode === 'viewing-agent' && viewedTask?.type === 'local_agent'",
    )
    expect(promptFooterSource).toContain(
      'action={isViewingLocalAgent ? "return to main" : "return to team lead"}',
    )
  })
})
