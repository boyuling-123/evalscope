import { describe, expect, it, vi } from 'vitest'
import { apiPostValidated, apiValidated } from './client'

/** Stub `fetch` to return `body` as a successful JSON response. */
function mockJsonResponse(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response),
  )
}

describe('apiValidated transport', () => {
  it('preserves explicit nulls from the validated backend response', async () => {
    mockJsonResponse({
      top: null,
      nested: { inner: null, items: [{ token: null }, { token: 7 }] },
    })

    const result = await apiValidated<{
      top: number | null
      nested: { inner: string | null; items: Array<{ token: number | null }> }
    }>('/api/v1/test')

    expect(result).toEqual({
      top: null,
      nested: { inner: null, items: [{ token: null }, { token: 7 }] },
    })
  })

  it('maps malformed JSON to a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid JSON')
        },
      }) as unknown as Response),
    )

    await expect(apiValidated('/api/v1/test')).rejects.toMatchObject({ kind: 'network' })
  })

  it('preserves a structured Action error message from an HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: async () => ({
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: '请先预览并确认项目创建操作。',
          },
        }),
      }) as unknown as Response),
    )

    await expect(apiPostValidated('/api/v1/test', {})).rejects.toMatchObject({
      kind: 'http-4xx',
      status: 409,
      message: '请先预览并确认项目创建操作。',
    })
  })
})
