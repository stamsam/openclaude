import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { getCommandQueue, resetCommandQueue } from './messageQueueManager.js'

describe('handlePromptSubmit', () => {
  beforeEach(() => {
    resetCommandQueue()
    mock.module('src/services/analytics/index.js', () => ({
      logEvent: () => {},
    }))
  })

  afterEach(() => {
    resetCommandQueue()
    mock.restore()
  })

  it('queues prompt submissions during generation without interrupting the current turn', async () => {
    const { handlePromptSubmit } = await import('./handlePromptSubmit.js')

    const abortCalls: unknown[] = []
    const inputChanges: string[] = []
    let cursorOffset = 123
    let bufferCleared = false
    let pastedContentsCleared = false
    let historyReset = false

    await handlePromptSubmit({
      input: '  use another library  ',
      mode: 'prompt',
      pastedContents: {},
      helpers: {
        setCursorOffset: offset => {
          cursorOffset = offset
        },
        clearBuffer: () => {
          bufferCleared = true
        },
        resetHistory: () => {
          historyReset = true
        },
      },
      onInputChange: value => {
        inputChanges.push(value)
      },
      setPastedContents: updater => {
        const nextValue =
          typeof updater === 'function'
            ? updater({ 1: { id: 1, type: 'text', content: 'x' } })
            : updater
        pastedContentsCleared = Object.keys(nextValue).length === 0
      },
      abortController: {
        abort: (reason: unknown) => {
          abortCalls.push(reason)
        },
      } as never,
      hasInterruptibleToolInProgress: true,
      queryGuard: {
        isActive: true,
      } as never,
      isExternalLoading: false,
      commands: [],
      messages: [],
      mainLoopModel: 'sonnet',
      ideSelection: undefined,
      querySource: 'repl' as never,
      setToolJSX: () => {},
      getToolUseContext: () => ({}) as never,
      setUserInputOnProcessing: () => {},
      setAbortController: () => {},
      onQuery: async () => {},
      setAppState: () => ({}) as never,
    })

    expect(abortCalls).toEqual([])
    expect(inputChanges).toEqual([''])
    expect(cursorOffset).toBe(0)
    expect(bufferCleared).toBe(true)
    expect(pastedContentsCleared).toBe(true)
    expect(historyReset).toBe(true)
    expect(getCommandQueue()).toMatchObject([
      {
        value: 'use another library',
        preExpansionValue: 'use another library',
        mode: 'prompt',
      },
    ])
  })

  it('warns when a local-looking text model receives a pasted image', async () => {
    const originalUseOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
    process.env.CLAUDE_CODE_USE_OPENAI = '1'

    try {
      const { handlePromptSubmit } = await import('./handlePromptSubmit.js')
      const notifications: string[] = []

      await handlePromptSubmit({
        input: '[Image #1] what is this?',
        mode: 'prompt',
        pastedContents: {
          1: {
            id: 1,
            type: 'image',
            content: 'ZmFrZQ==',
            mediaType: 'image/png',
          },
        },
        helpers: {
          setCursorOffset: () => {},
          clearBuffer: () => {},
          resetHistory: () => {},
        },
        onInputChange: () => {},
        setPastedContents: () => {},
        abortController: undefined,
        hasInterruptibleToolInProgress: false,
        queryGuard: {
          isActive: true,
        } as never,
        isExternalLoading: false,
        commands: [],
        messages: [],
        mainLoopModel: 'Gemma-E2B-Chimera v4',
        ideSelection: undefined,
        querySource: 'repl' as never,
        setToolJSX: () => {},
        getToolUseContext: () => ({}) as never,
        setUserInputOnProcessing: () => {},
        setAbortController: () => {},
        onQuery: async () => {},
        setAppState: () => ({}) as never,
        addNotification: notification => {
          notifications.push(notification.text)
        },
      })

      expect(notifications).toEqual([
        'This local model may not support images. Pick a /model entry marked Vision if it answers with [Image #N] instead of the screenshot.',
      ])
    } finally {
      if (originalUseOpenAI === undefined) {
        delete process.env.CLAUDE_CODE_USE_OPENAI
      } else {
        process.env.CLAUDE_CODE_USE_OPENAI = originalUseOpenAI
      }
    }
  })
})
