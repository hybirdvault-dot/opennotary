/**
 * USDC (IERC-20) settlement helpers for the flat $1.00 notarization fee.
 *
 * All token calls go through an injected viem client; ERC-20 errors propagate
 * unwrapped. Source pattern: OpenZeppelin IERC20 docs.
 */
import type { Account, Address, Hex, PublicClient, WalletClient } from 'viem';

/**
 * USDC (Circle) contract address on Base Sepolia.
 */
export const USDC_ADDRESS_BASE_SEPOLIA: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

/**
 * Fee paid to the notary per act, in USDC (6 decimals): 99 cents.
 */
export const NOTARY_FEE = 990_000n;

/**
 * Fee paid to the protocol treasury per act, in USDC (6 decimals): 1 cent.
 */
export const PROTOCOL_FEE = 10_000n;

/**
 * Total fee per notarial act, in USDC (6 decimals): $1.00.
 */
export const TOTAL_FEE = 1_000_000n;

/**
 * Minimal IERC-20 surface OpenNotary settles fees with.
 */
export const usdcAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transferFrom',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

/**
 * Submits a USDC `approve` transaction and returns its hash.
 *
 * @param walletClient - Signing client; its `account` sends the transaction.
 * @param args - Spender to authorize and allowance amount in USDC base units.
 */
export async function approveUsdc(
  walletClient: WalletClient,
  args: { spender: Address; amount: bigint },
): Promise<Hex> {
  return walletClient.writeContract({
    address: USDC_ADDRESS_BASE_SEPOLIA,
    abi: usdcAbi,
    functionName: 'approve',
    args: [args.spender, args.amount],
    // viem falls back to `client.account` when the account is unset at runtime.
    chain: walletClient.chain,
    account: walletClient.account as Account,
  });
}

/**
 * Reads the USDC `allowance` granted by `owner` to `spender`.
 *
 * @param client - Public client used for the read.
 * @param args - Token owner and spender addresses.
 * @returns Allowance in USDC base units (6 decimals).
 */
export async function allowanceOf(
  client: PublicClient,
  args: { owner: Address; spender: Address },
): Promise<bigint> {
  return (await client.readContract({
    address: USDC_ADDRESS_BASE_SEPOLIA,
    abi: usdcAbi,
    functionName: 'allowance',
    args: [args.owner, args.spender],
  })) as bigint;
}

/**
 * Reads the USDC balance held by `owner`.
 *
 * @param client - Public client used for the read.
 * @param owner - Address whose balance is queried.
 * @returns Balance in USDC base units (6 decimals).
 */
export async function balanceOf(client: PublicClient, owner: Address): Promise<bigint> {
  return (await client.readContract({
    address: USDC_ADDRESS_BASE_SEPOLIA,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [owner],
  })) as bigint;
}
