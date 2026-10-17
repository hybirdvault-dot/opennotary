import { describe, expect, test, vi } from 'vitest';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';

/**
 * Acceptance tests for src/lib/usdc.ts (spec section 7).
 *
 * PublicClient/WalletClient are plain injected objects with spied
 * readContract/writeContract functions; no package mocks are needed.
 */

type MockFn = ReturnType<typeof vi.fn>;

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const SPENDER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const OWNER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;
const AMOUNT = 1_000_000n;
const ALLOWANCE = 500_000n;
const BALANCE = 42_000_000n;
const TX_HASH = ('0x' + '77'.repeat(32)) as Hex;

function makePublicClient(readContract: MockFn): PublicClient {
  return { readContract } as unknown as PublicClient;
}

function makeWalletClient(writeContract: MockFn): WalletClient {
  return { writeContract } as unknown as WalletClient;
}

describe('src/lib/usdc', () => {
  describe('constants and abi', () => {
    test('test_usdcAddress_matchesBaseSepoliaDeployment', async () => {
      const { USDC_ADDRESS_BASE_SEPOLIA } = await import('@/lib/usdc');
      expect(USDC_ADDRESS_BASE_SEPOLIA).toBe(USDC_ADDRESS);
    });

    test('test_feeConstants_splitOneUsdcIntoNotaryAndProtocolShares', async () => {
      const { NOTARY_FEE, PROTOCOL_FEE, TOTAL_FEE } = await import('@/lib/usdc');
      expect(NOTARY_FEE).toBe(990_000n);
      expect(PROTOCOL_FEE).toBe(10_000n);
      expect(TOTAL_FEE).toBe(1_000_000n);
      expect(TOTAL_FEE).toBe(NOTARY_FEE + PROTOCOL_FEE);
    });

    test('test_usdcAbi_exposesExactlyTheMinimalIerc20Functions', async () => {
      const { usdcAbi } = await import('@/lib/usdc');
      expect(Array.isArray(usdcAbi)).toBe(true);
      const functionNames = (usdcAbi as { type: string; name?: string }[])
        .filter((item) => item.type === 'function')
        .map((item) => item.name)
        .sort();
      expect(functionNames).toEqual(
        ['allowance', 'approve', 'balanceOf', 'decimals', 'symbol', 'transferFrom'].sort(),
      );
    });
  });

  describe('approveUsdc', () => {
    test('test_approveUsdc_submitsApproveForSpenderAndAmountAndReturnsTxHash', async () => {
      const writeContract = vi.fn().mockResolvedValue(TX_HASH);
      const { approveUsdc } = await import('@/lib/usdc');

      const hash = await approveUsdc(makeWalletClient(writeContract), {
        spender: SPENDER,
        amount: AMOUNT,
      });

      expect(writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: USDC_ADDRESS,
          functionName: 'approve',
          args: [SPENDER, AMOUNT],
        }),
      );
      expect(hash).toBe(TX_HASH);
    });

    test('test_approveUsdc_propagatesWalletRejectionUnwrapped', async () => {
      const failure = new Error('user rejected transaction');
      const writeContract = vi.fn().mockRejectedValue(failure);
      const { approveUsdc } = await import('@/lib/usdc');

      await expect(
        approveUsdc(makeWalletClient(writeContract), { spender: SPENDER, amount: AMOUNT }),
      ).rejects.toBe(failure);
    });
  });

  describe('allowanceOf', () => {
    test('test_allowanceOf_readsAllowanceForOwnerAndSpender', async () => {
      const readContract = vi.fn().mockResolvedValue(ALLOWANCE);
      const { allowanceOf } = await import('@/lib/usdc');

      const allowance = await allowanceOf(makePublicClient(readContract), {
        owner: OWNER,
        spender: SPENDER,
      });

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: USDC_ADDRESS,
          functionName: 'allowance',
          args: [OWNER, SPENDER],
        }),
      );
      expect(allowance).toBe(ALLOWANCE);
    });

    test('test_allowanceOf_propagatesRpcFailureUnwrapped', async () => {
      const failure = new Error('rpc unreachable');
      const readContract = vi.fn().mockRejectedValue(failure);
      const { allowanceOf } = await import('@/lib/usdc');

      await expect(
        allowanceOf(makePublicClient(readContract), { owner: OWNER, spender: SPENDER }),
      ).rejects.toBe(failure);
    });
  });

  describe('balanceOf', () => {
    test('test_balanceOf_readsOwnerTokenBalance', async () => {
      const readContract = vi.fn().mockResolvedValue(BALANCE);
      const { balanceOf } = await import('@/lib/usdc');

      const balance = await balanceOf(makePublicClient(readContract), OWNER);

      expect(readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: USDC_ADDRESS,
          functionName: 'balanceOf',
          args: [OWNER],
        }),
      );
      expect(balance).toBe(BALANCE);
    });

    test('test_balanceOf_propagatesRpcFailureUnwrapped', async () => {
      const failure = new Error('rpc unreachable');
      const readContract = vi.fn().mockRejectedValue(failure);
      const { balanceOf } = await import('@/lib/usdc');

      await expect(balanceOf(makePublicClient(readContract), OWNER)).rejects.toBe(failure);
    });
  });
});
