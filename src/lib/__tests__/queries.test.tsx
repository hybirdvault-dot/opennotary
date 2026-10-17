// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Abi,
  type Address,
  type Hex,
} from 'viem';

/**
 * Acceptance tests for src/lib/queries.ts (spec section 10).
 *
 * '@/lib/contract' is mocked to isolate hook behavior, and wagmi's
 * usePublicClient is stubbed with a sentinel client. The ActNotFound case is
 * simulated with a real viem ContractFunctionExecutionError whose message and
 * decoded cause both carry the revert reason, so any reasonable detection
 * strategy in the hook sees the same signal the contract produces.
 */

const h = vi.hoisted(() => ({
  getAct: vi.fn(),
  getActsByNotary: vi.fn(),
  getNotary: vi.fn(),
  isNotaryActive: vi.fn(),
  publicClient: { marker: 'public-client' },
}));

vi.mock('@/lib/contract', () => ({
  getAct: (...args: unknown[]) => h.getAct(...args),
  getActsByNotary: (...args: unknown[]) => h.getActsByNotary(...args),
  getNotary: (...args: unknown[]) => h.getNotary(...args),
  isNotaryActive: (...args: unknown[]) => h.isNotaryActive(...args),
}));

vi.mock('wagmi', () => ({
  usePublicClient: () => h.publicClient,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DOC_HASH = ('0x' + 'ab'.repeat(32)) as Hex;
const NOTARY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const REGISTRY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as Address;
const ZERO_HASH = ('0x' + '00'.repeat(32)) as Hex;

const ACT = {
  docHash: DOC_HASH,
  notary: NOTARY,
  signer: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address,
  ipfsCid: ('0x' + '22'.repeat(32)) as Hex,
  docType: ('0x' + '33'.repeat(32)) as Hex,
  stateCode: ('0x' + '44'.repeat(32)) as Hex,
  timestamp: 1_700_000_000n,
  revoked: false,
};

const COMMISSION = {
  commissionHash: ('0x' + '11'.repeat(32)) as Hex,
  stateCode: ('0x' + '44'.repeat(32)) as Hex,
  commissionExpiry: 1_900_000_000n,
  active: true,
};

const MISSING_COMMISSION = {
  commissionHash: ZERO_HASH,
  stateCode: ZERO_HASH,
  commissionExpiry: 0n,
  active: false,
};

function contractRevertError(functionName: string, errorName: string): ContractFunctionExecutionError {
  const errorAbi: Abi = [{ type: 'error', name: errorName, inputs: [] }];
  const data = encodeErrorResult({ abi: errorAbi, errorName: errorName as never });
  const reverted = new ContractFunctionRevertedError({
    abi: errorAbi,
    functionName,
    data,
    message: errorName,
  });
  return new ContractFunctionExecutionError(reverted, {
    abi: [],
    contractAddress: REGISTRY_ADDRESS,
    functionName,
    args: [],
  });
}

function createWrapper(): {
  Wrapper: React.ComponentType<{ children: React.ReactNode }>;
  queryClient: QueryClient;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
}

async function flushAsync(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  h.getAct.mockReset();
  h.getActsByNotary.mockReset();
  h.getNotary.mockReset();
  h.isNotaryActive.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('src/lib/queries', () => {
  describe('useNotarialAct', () => {
    test('test_useNotarialAct_returnsActFromContract', async () => {
      h.getAct.mockResolvedValue(ACT);
      const { useNotarialAct } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotarialAct(DOC_HASH), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(ACT);
      expect(h.getAct).toHaveBeenCalledWith(h.publicClient, DOC_HASH);
    });

    test('test_useNotarialAct_mapsActNotFoundRevertToNull', async () => {
      h.getAct.mockRejectedValue(contractRevertError('getAct', 'ActNotFound'));
      const { useNotarialAct } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotarialAct(DOC_HASH), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    test('test_useNotarialAct_propagatesUnexpectedContractFailure', async () => {
      const failure = new Error('rpc unreachable');
      h.getAct.mockRejectedValue(failure);
      const { useNotarialAct } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotarialAct(DOC_HASH), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(failure);
    });

    test('test_useNotarialAct_isDisabledWithoutDocHash', async () => {
      const { useNotarialAct } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotarialAct(undefined), { wrapper: Wrapper });

      await flushAsync();
      expect(h.getAct).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe('idle');
    });

    test('test_useNotarialAct_skipsRefetchWhileDataIsFreshFor30Seconds', async () => {
      h.getAct.mockResolvedValue(ACT);
      const { useNotarialAct } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const first = renderHook(() => useNotarialAct(DOC_HASH), { wrapper: Wrapper });
      await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
      first.unmount();

      const second = renderHook(() => useNotarialAct(DOC_HASH), { wrapper: Wrapper });
      await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

      expect(h.getAct).toHaveBeenCalledTimes(1);
    });
  });

  describe('useNotaryActs', () => {
    test('test_useNotaryActs_returnsDocHashesForNotary', async () => {
      const hashes = [DOC_HASH, ('0x' + 'cd'.repeat(32)) as Hex];
      h.getActsByNotary.mockResolvedValue(hashes);
      const { useNotaryActs } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotaryActs(NOTARY), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(hashes);
      expect(h.getActsByNotary).toHaveBeenCalledWith(h.publicClient, NOTARY);
    });

    test('test_useNotaryActs_isDisabledWithoutNotary', async () => {
      const { useNotaryActs } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotaryActs(undefined), { wrapper: Wrapper });

      await flushAsync();
      expect(h.getActsByNotary).not.toHaveBeenCalled();
      expect(result.current.fetchStatus).toBe('idle');
    });

    test('test_useNotaryActs_propagatesUnexpectedContractFailure', async () => {
      const failure = new Error('rpc unreachable');
      h.getActsByNotary.mockRejectedValue(failure);
      const { useNotaryActs } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotaryActs(NOTARY), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(failure);
    });
  });

  describe('useNotaryCommission', () => {
    test('test_useNotaryCommission_returnsCommissionRecordForRegisteredNotary', async () => {
      h.getNotary.mockResolvedValue(COMMISSION);
      h.isNotaryActive.mockResolvedValue(true);
      const { useNotaryCommission } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotaryCommission(NOTARY), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(COMMISSION);
    });

    test('test_useNotaryCommission_mapsMissingCommissionToNull', async () => {
      h.getNotary.mockResolvedValue(MISSING_COMMISSION);
      h.isNotaryActive.mockResolvedValue(false);
      const { useNotaryCommission } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotaryCommission(NOTARY), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
    });

    test('test_useNotaryCommission_propagatesUnexpectedContractFailure', async () => {
      const failure = new Error('rpc unreachable');
      h.getNotary.mockRejectedValue(failure);
      h.isNotaryActive.mockResolvedValue(false);
      const { useNotaryCommission } = await import('@/lib/queries');
      const { Wrapper } = createWrapper();

      const { result } = renderHook(() => useNotaryCommission(NOTARY), { wrapper: Wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(failure);
    });
  });
});
