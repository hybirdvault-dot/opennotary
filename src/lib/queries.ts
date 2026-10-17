/**
 * TanStack Query hooks wrapping the `NotaryRegistry` readers in
 * {@link ./contract}.
 *
 * Hooks resolve their viem client from wagmi's `usePublicClient()` and share a
 * 30-second `staleTime`. SDK/RPC errors surface through the query's `error`
 * except the contract's `ActNotFound()` revert on
 * {@link useNotarialAct}, which maps to `null`.
 *
 * Source pattern: TanStack Query v5 useQuery examples.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { zeroHash, type Address, type Hex, type PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';

import {
  getAct,
  getActsByNotary,
  getNotary,
  type NotarialAct,
  type NotaryRecord,
} from './contract';

/**
 * Query freshness window shared by all registry hooks (30 seconds).
 */
const STALE_TIME_MS = 30_000;

/**
 * Returns whether a thrown value is (or wraps) the contract's `ActNotFound()`
 * revert, walking the error cause chain like viem's `BaseError` does.
 */
function isErrorNamed(err: unknown, errorName: string): boolean {
  const needle = errorName.toLowerCase();
  let current: unknown = err;
  while (current) {
    const candidate = current as {
      errorName?: unknown;
      name?: unknown;
      message?: unknown;
      shortMessage?: unknown;
      details?: unknown;
      data?: { errorName?: unknown } | undefined;
      cause?: unknown;
    };
    for (const value of [
      candidate.errorName,
      candidate.name,
      candidate.message,
      candidate.shortMessage,
      candidate.details,
      candidate.data?.errorName,
    ]) {
      if (typeof value === 'string' && value.toLowerCase().replace(/\s/g, '').includes(needle)) {
        return true;
      }
    }
    current = candidate.cause;
  }
  return false;
}

/**
 * Fetches the notarial act for `docHash`.
 *
 * @param docHash - Content hash identifying the act, or `undefined` to skip.
 * @returns The act, or `null` when the contract reverts `ActNotFound()`.
 * The query is disabled while `docHash` is falsy.
 */
export function useNotarialAct(docHash: Hex | undefined): UseQueryResult<NotarialAct | null> {
  const client = usePublicClient();
  return useQuery<NotarialAct | null>({
    queryKey: ['notarialAct', docHash],
    enabled: !!docHash,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      try {
        return await getAct(client as PublicClient, docHash as Hex);
      } catch (err) {
        if (isErrorNamed(err, 'ActNotFound')) {
          return null;
        }
        throw err;
      }
    },
  });
}

/**
 * Fetches every document hash recorded by `notary`.
 *
 * @param notary - Address of the notary, or `undefined` to skip.
 * @returns Document hashes in insertion order. The query is disabled while
 * `notary` is falsy.
 */
export function useNotaryActs(notary: Address | undefined): UseQueryResult<Hex[]> {
  const client = usePublicClient();
  return useQuery<Hex[]>({
    queryKey: ['notaryActs', notary],
    enabled: !!notary,
    staleTime: STALE_TIME_MS,
    queryFn: () => getActsByNotary(client as PublicClient, notary as Address),
  });
}

/**
 * Fetches the commission record of `notary`.
 *
 * @param notary - Address of the notary, or `undefined` to skip.
 * @returns The record, or `null` when the notary is not registered. The query
 * is disabled while `notary` is falsy.
 */
export function useNotaryCommission(
  notary: Address | undefined,
): UseQueryResult<NotaryRecord | null> {
  const client = usePublicClient();
  return useQuery<NotaryRecord | null>({
    queryKey: ['notaryCommission', notary],
    enabled: !!notary,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      try {
        const record = await getNotary(client as PublicClient, notary as Address);
        const isEmpty =
          record.commissionHash === zeroHash &&
          record.stateCode === zeroHash &&
          record.commissionExpiry === 0n &&
          record.active === false;
        return isEmpty ? null : record;
      } catch (err) {
        if (isErrorNamed(err, 'NotaryNotFound')) {
          return null;
        }
        throw err;
      }
    },
  });
}
