import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { baseSepolia } from 'wagmi/chains';

/**
 * Acceptance tests for src/lib/wallet.ts (spec section 1).
 *
 * The wallet stack is mocked at the package boundary: both `wagmi` and
 * `@rainbow-me/rainbowkit` may supply `getDefaultConfig` (RainbowKit installation
 * docs re-export it), so both are stubbed with the same recorder. `wagmi/chains`
 * stays real so chain pinning is asserted against the genuine baseSepolia object.
 */

const h = vi.hoisted(() => ({
  getDefaultConfig: vi.fn(),
  darkTheme: vi.fn(),
}));

vi.mock('wagmi', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getDefaultConfig: h.getDefaultConfig };
});

vi.mock('@rainbow-me/rainbowkit', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getDefaultConfig: h.getDefaultConfig, darkTheme: h.darkTheme };
});

const SENTINEL_CONFIG = { marker: 'wagmi-config' };
const SENTINEL_THEME = { marker: 'rainbowkit-theme' };

const PROJECT_ID_ENV = 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID';

function unsetEnv(name: string): void {
  vi.stubEnv(name, '');
  delete process.env[name];
}

async function importWallet(): Promise<typeof import('@/lib/wallet')> {
  vi.resetModules();
  return await import('@/lib/wallet');
}

beforeEach(() => {
  h.getDefaultConfig.mockReset().mockReturnValue(SENTINEL_CONFIG);
  h.darkTheme.mockReset().mockReturnValue(SENTINEL_THEME);
  unsetEnv(PROJECT_ID_ENV);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('src/lib/wallet', () => {
  test('test_projectId_fallsBackToEmptyStringWhenEnvIsUnset', async () => {
    const wallet = await importWallet();
    expect(wallet.projectId).toBe('');
  });

  test('test_projectId_usesWalletConnectProjectIdEnvValue', async () => {
    vi.stubEnv(PROJECT_ID_ENV, 'wc-project-id-123');
    const wallet = await importWallet();
    expect(wallet.projectId).toBe('wc-project-id-123');
  });

  test('test_chains_isPinnedToBaseSepoliaOnly', async () => {
    const wallet = await importWallet();
    expect(wallet.chains).toHaveLength(1);
    expect(wallet.chains[0]).toEqual(baseSepolia);
    expect(wallet.chains[0].id).toBe(84532);
  });

  test('test_wagmiConfig_isBuiltWithOpenNotaryAppProjectIdChainsAndSsr', async () => {
    vi.stubEnv(PROJECT_ID_ENV, 'wc-project-id-456');
    const wallet = await importWallet();
    expect(wallet.wagmiConfig).toBe(SENTINEL_CONFIG);
    expect(h.getDefaultConfig).toHaveBeenCalledWith({
      appName: 'OpenNotary',
      projectId: 'wc-project-id-456',
      chains: [baseSepolia],
      ssr: true,
    });
  });

  test('test_rainbowKitTheme_usesGoldAccentAndLargeBorderRadius', async () => {
    const wallet = await importWallet();
    expect(wallet.rainbowKitTheme).toBe(SENTINEL_THEME);
    expect(h.darkTheme).toHaveBeenCalledWith({
      accentColor: '#C8A968',
      borderRadius: 'large',
    });
  });
});
