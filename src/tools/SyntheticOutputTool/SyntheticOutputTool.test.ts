import { describe, expect, test } from 'bun:test'
import { createSyntheticOutputTool } from './SyntheticOutputTool.js'

const ARRAY_OF_OBJECTS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
} as const

const STRING_ROOT_SCHEMA = { type: 'string' } as const

const OBJECT_SCHEMA = {
  type: 'object',
  properties: { count: { type: 'integer' } },
  required: ['count'],
  additionalProperties: false,
} as const

describe('createSyntheticOutputTool', () => {
  test('wraps top-level array schemas as object tool input', () => {
    const result = createSyntheticOutputTool({ ...ARRAY_OF_OBJECTS_SCHEMA })
    if (!('tool' in result)) throw new Error(`expected tool: ${result.error}`)

    const schema = result.tool.inputJSONSchema as Record<string, unknown>
    expect(schema.type).toBe('object')
    expect((schema.properties as Record<string, unknown>).result).toEqual(
      ARRAY_OF_OBJECTS_SCHEMA,
    )
    expect(schema.required).toEqual(['result'])
  })

  test('unwraps top-level array structured output', async () => {
    const result = createSyntheticOutputTool({ ...ARRAY_OF_OBJECTS_SCHEMA })
    if (!('tool' in result)) throw new Error(`expected tool: ${result.error}`)

    const payload = [{ name: 'one' }, { name: 'two' }]
    const callResult = await result.tool.call(
      { result: payload },
      undefined as never,
    )
    expect(callResult.structured_output).toEqual(payload)
  })

  test('wraps and unwraps a top-level string schema', async () => {
    const result = createSyntheticOutputTool({ ...STRING_ROOT_SCHEMA })
    if (!('tool' in result)) throw new Error(`expected tool: ${result.error}`)

    const callResult = await result.tool.call(
      { result: 'hello' },
      undefined as never,
    )
    expect(callResult.structured_output).toBe('hello')
  })

  test('leaves object root schemas untouched', async () => {
    const result = createSyntheticOutputTool({ ...OBJECT_SCHEMA })
    if (!('tool' in result)) throw new Error(`expected tool: ${result.error}`)
    expect(result.tool.inputJSONSchema).toEqual(OBJECT_SCHEMA)

    const callResult = await result.tool.call(
      { count: 5 },
      undefined as never,
    )
    expect(callResult.structured_output).toEqual({ count: 5 })
  })

  test('rejects wrapped payloads that violate the inner schema', async () => {
    const result = createSyntheticOutputTool({ ...ARRAY_OF_OBJECTS_SCHEMA })
    if (!('tool' in result)) throw new Error(`expected tool: ${result.error}`)

    await expect(
      result.tool.call({ result: [{ wrong: 'shape' }] }, undefined as never),
    ).rejects.toThrow(/schema/)
  })
})
