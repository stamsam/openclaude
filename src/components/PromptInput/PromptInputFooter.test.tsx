import { describe, expect, mock, test } from 'bun:test'
import { AppStateProvider } from '../../state/AppState.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { renderToString } from '../../utils/staticRender.js'

mock.module('./PromptInputHelpMenu.js', () => ({
  PromptInputHelpMenu: () => null,
}))

describe('PromptInputFooter', () => {
  test('keeps CTX visible at the right edge of the footer', async () => {
    const { default: PromptInputFooter } = await import('./PromptInputFooter.js')

    const output = await renderToString(
      <AppStateProvider>
        <PromptInputFooter
          apiKeyStatus="valid"
          debug={false}
          exitMessage={{ show: false }}
          vimMode={undefined}
          mode="prompt"
          autoUpdaterResult={null}
          isAutoUpdating={false}
          verbose={false}
          onAutoUpdaterResult={() => {}}
          onChangeIsUpdating={() => {}}
          suggestions={[]}
          selectedSuggestion={0}
          toolPermissionContext={getEmptyToolPermissionContext()}
          helpOpen={false}
          suppressHint={false}
          isLoading={false}
          tasksSelected={false}
          teamsSelected={false}
          bridgeSelected={false}
          tmuxSelected={false}
          ideSelection={undefined}
          messages={[]}
          isSearching={false}
          historyQuery=""
          setHistoryQuery={() => {}}
          historyFailedMatch={false}
        />
      </AppStateProvider>,
      80,
    )

    const ctxLine = output.split('\n').find(line => line.includes('CTX '))
    expect(ctxLine).toBeDefined()
    expect(ctxLine!.indexOf('CTX ')).toBeGreaterThan(65)
  })
})
