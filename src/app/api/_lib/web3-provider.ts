/**
 * Server-side EIP-1193 provider for API routes.
 *
 * Read calls (`eth_call`, receipts, gas) go through a viem public client;
 * `eth_sendTransaction` is signed locally with the relayer key
 * (`EAS_RELAYER_PRIVATE_KEY`, server-only — never exposed to the browser) so
 * `lib/attest` can issue EAS attestations from the backend. `lib/contract`
 * read helpers use {@link getServerPublicClient} directly.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import type { Eip1193Provider } from '@/lib/attest';

/** Base Sepolia JSON-RPC endpoint shared by all server reads and writes. */
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';

/**
 * Builds the shared viem public client used by API routes to read the
 * `NotaryRegistry` contract and EAS attestations. The chain is widened to the
 * generic `Chain` so the client matches the `PublicClient` contract in
 * `lib/contract` (Base's op-stack formatters otherwise skew the type).
 */
export function getServerPublicClient(): PublicClient {
  return createPublicClient({ chain: baseSepolia as Chain, transport: http(RPC_URL) });
}

/** A JSON-RPC transaction request in EIP-1193 wire format. */
type RpcTransaction = {
  from?: string;
  to?: string;
  data?: string;
  value?: string;
};

/** Normalizes `eth_*` params (positional array or empty) into a list. */
function rpcArgs(params: readonly unknown[] | Record<string, unknown> | undefined): unknown[] {
  return Array.isArray(params) ? params : [];
}

/**
 * Creates an EIP-1193 provider backed by viem for use with the EAS SDK
 * bridge in `lib/attest`. `eth_sendTransaction` signs with the relayer key.
 *
 * @throws `Error('EAS_RELAYER_PRIVATE_KEY is not set')` when a transaction is
 * attempted without the server-side relayer key.
 */
export function createRelayerProvider(): Eip1193Provider {
  return {
    async request({ method, params }): Promise<unknown> {
      const args = rpcArgs(params);
      const publicClient = getServerPublicClient();

      switch (method) {
        case 'eth_chainId':
          return `0x${baseSepolia.id.toString(16)}`;
        case 'eth_blockNumber': {
          const blockNumber = await publicClient.getBlockNumber();
          return `0x${blockNumber.toString(16)}`;
        }
        case 'eth_call': {
          const tx = args[0] as RpcTransaction;
          const result = await publicClient.call({
            account: isAddress(tx.from ?? '') ? (tx.from as Address) : undefined,
            to: isAddress(tx.to ?? '') ? (tx.to as Address) : undefined,
            data: (tx.data ?? '0x') as Hex,
            value: tx.value ? BigInt(tx.value) : undefined,
          });
          return result.data ?? '0x';
        }
        case 'eth_estimateGas': {
          const tx = args[0] as RpcTransaction;
          const gas = await publicClient.estimateGas({
            account: isAddress(tx.from ?? '') ? (tx.from as Address) : undefined,
            to: isAddress(tx.to ?? '') ? (tx.to as Address) : undefined,
            data: (tx.data ?? '0x') as Hex,
            value: tx.value ? BigInt(tx.value) : undefined,
          });
          return `0x${gas.toString(16)}`;
        }
        case 'eth_getTransactionReceipt': {
          const hash = args[0] as Hex;
          try {
            return await publicClient.getTransactionReceipt({ hash });
          } catch {
            // RPC semantics: a pending (not yet mined) transaction has no receipt.
            return null;
          }
        }
        case 'eth_sendTransaction': {
          const key = process.env.EAS_RELAYER_PRIVATE_KEY;
          if (!key) {
            throw new Error('EAS_RELAYER_PRIVATE_KEY is not set');
          }
          const account = privateKeyToAccount(key as Hex);
          const tx = args[0] as RpcTransaction;
          const walletClient = createWalletClient({
            account,
            chain: baseSepolia,
            transport: http(RPC_URL),
          });
          return walletClient.sendTransaction({
            account,
            chain: baseSepolia,
            to: isAddress(tx.to ?? '') ? (tx.to as Address) : undefined,
            data: (tx.data ?? '0x') as Hex,
            value: tx.value ? BigInt(tx.value) : undefined,
          });
        }
        default:
          throw new Error(`Unsupported JSON-RPC method: ${method}`);
      }
    },
  };
}
