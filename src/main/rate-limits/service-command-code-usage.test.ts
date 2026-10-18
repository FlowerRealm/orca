import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitService } from './service'
import { fetchClaudeRateLimits } from './claude-fetcher'
import { fetchCodexRateLimits } from './codex-fetcher'
import { fetchCommandCodeRateLimits } from './command-code-usage-fetcher'
import {
  okProvider,
  resetRateLimitProviderMocks,
  unavailableProvider
} from './rate-limit-service-test-harness'

vi.mock('./claude-fetcher', () => ({
  fetchClaudeRateLimits: vi.fn(),
  fetchManagedAccountUsage: vi.fn()
}))

vi.mock('./codex-fetcher', () => ({
  consumeCodexRateLimitResetCredit: vi.fn(),
  fetchCodexRateLimits: vi.fn()
}))

vi.mock('./gemini-usage-fetcher', () => ({
  fetchGeminiRateLimits: vi.fn()
}))

vi.mock('./antigravity-usage-fetcher', () => ({
  fetchAntigravityRateLimits: vi.fn()
}))

vi.mock('./kimi-fetcher', () => ({
  fetchKimiRateLimits: vi.fn()
}))

vi.mock('./opencode-go-usage-source-selection', () => ({
  fetchOpenCodeGoUsage: vi.fn()
}))

vi.mock('./zcode-usage-fetcher', () => ({
  fetchZcodeRateLimits: vi.fn(),
  hasZcodeCliPlanCredentials: vi.fn(() => false)
}))

vi.mock('./command-code-usage-fetcher', () => ({
  fetchCommandCodeRateLimits: vi.fn()
}))

vi.mock('./minimax/minimax-fetcher', () => ({
  fetchMiniMaxRateLimits: vi.fn()
}))

vi.mock('./grok-fetcher', () => ({
  fetchGrokRateLimits: vi.fn()
}))

vi.mock('./cursor-fetcher', () => ({
  fetchCursorRateLimits: vi.fn()
}))

vi.mock('./cursor-auth', () => ({
  readCursorAuthSession: vi.fn()
}))

vi.mock('./grok-auth', () => ({
  readGrokAuthSession: vi.fn(() => ({ status: 'missing' }))
}))

vi.mock('../minimax/minimax-cookie-store', () => ({
  hasMiniMaxSessionCookie: vi.fn(() => false)
}))

vi.mock('../minimax/minimax-api-key-store', () => ({
  hasMiniMaxApiKey: vi.fn(() => false)
}))

vi.mock('../zcode/zcode-plan-api-key-store', () => ({
  hasZcodePlanApiKey: vi.fn(() => false),
  readZcodePlanApiKey: vi.fn(() => null),
  saveZcodePlanApiKey: vi.fn(),
  clearZcodePlanApiKey: vi.fn()
}))

const HOST_HOME = { runtime: 'host' as const, wslDistro: null, path: '/tmp/commandcode' }

describe('RateLimitService command code usage', () => {
  beforeEach(() => {
    resetRateLimitProviderMocks()
    vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 7))
    vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 20))
  })

  it('fetches with the resolved home and publishes the snapshot', async () => {
    const service = new RateLimitService()
    service.setCommandCodeHomeResolver(async () => HOST_HOME)
    vi.mocked(fetchCommandCodeRateLimits).mockResolvedValueOnce(
      okProvider('command-code', 42, Date.now())
    )

    await service.refresh()

    expect(fetchCommandCodeRateLimits).toHaveBeenCalledTimes(1)
    expect(fetchCommandCodeRateLimits).toHaveBeenCalledWith({
      home: HOST_HOME,
      signal: expect.any(AbortSignal)
    })
    const state = service.getState()
    expect(state.commandCode?.status).toBe('ok')
    expect(state.commandCode?.session?.usedPercent).toBe(42)
    expect(state.commandCodeAuthConfigured).toBe(true)
  })

  it('resolves the host home itself when no resolver is registered', async () => {
    const service = new RateLimitService()
    vi.mocked(fetchCommandCodeRateLimits).mockResolvedValueOnce(
      okProvider('command-code', 12, Date.now())
    )

    await service.refresh()

    expect(fetchCommandCodeRateLimits).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal)
    })
    expect(service.getState().commandCode?.session?.usedPercent).toBe(12)
  })

  it('marks the bar unconfigured when this machine has no CLI login', async () => {
    const service = new RateLimitService()
    vi.mocked(fetchCommandCodeRateLimits).mockResolvedValueOnce(
      unavailableProvider('command-code', 'Command Code is not signed in on this machine')
    )

    await service.refresh()

    const state = service.getState()
    expect(state.commandCode?.status).toBe('unavailable')
    expect(state.commandCodeAuthConfigured).toBe(false)
  })

  it('discards a previous reading once the login disappears', async () => {
    const service = new RateLimitService()
    vi.mocked(fetchCommandCodeRateLimits).mockResolvedValueOnce(
      okProvider('command-code', 55, Date.now())
    )
    await service.refresh()
    expect(service.getState().commandCode?.session?.usedPercent).toBe(55)

    vi.mocked(fetchCommandCodeRateLimits).mockResolvedValueOnce(
      unavailableProvider('command-code', 'Command Code is not signed in on this machine')
    )
    await service.refresh()

    const state = service.getState()
    expect(state.commandCode?.status).toBe('unavailable')
    expect(state.commandCode?.session).toBeNull()
    expect(state.commandCodeAuthConfigured).toBe(false)
  })

  it('keeps a failing provider to its own slot', async () => {
    const service = new RateLimitService()
    vi.mocked(fetchCommandCodeRateLimits).mockRejectedValueOnce(new Error('boom'))

    await service.refresh()

    const state = service.getState()
    expect(state.commandCode?.status).toBe('error')
    expect(state.commandCode?.error).toBe('boom')
    expect(state.claude?.status).toBe('ok')
    expect(state.codex?.status).toBe('ok')
  })
})
