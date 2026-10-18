'use client';

/**
 * Notary dashboard: 2×2 bento grid (total acts, earnings, commission status,
 * recent acts preview), a full recent-acts list and the gold FAB. Data comes
 * from the `lib/queries` hooks with loading/empty/error states throughout.
 *
 * Per-act facts (timestamp + revoked) are resolved in ONE batched Multicall3
 * read instead of one RPC call per row (the previous N+1), and the aggregates
 * are keyed to the connected wallet so a wallet switch can never mix one
 * notary's rows into another's totals.
 */
import { useQuery } from '@tanstack/react-query';
import { format, fromUnixTime } from 'date-fns';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarDays,
  Coins,
  FileSignature,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import type { Abi, Address, Hex, PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { useAccount } from 'wagmi';

import {
  getNotaryRegistryAddress,
  notaryRegistryAbi,
  type NotarialAct,
} from '@/lib/contract';
import { useNotaryActs, useNotaryCommission } from '@/lib/queries';
import { NOTARY_FEE } from '@/lib/usdc';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BentoCard } from './bento-card';
import { HashChip } from './hash-chip';
import { NotaryBadge } from './notary-badge';
import { WalletConnectButton } from './wallet-connect-button';

/** Commission terms are tracked against a standard 4-year window. */
const COMMISSION_TERM_DAYS = 1461;

/** Maximum rows rendered in the recent-acts list. */
const MAX_ROWS = 20;

/** Acts resolved per Multicall3 batch (keeps eth_call payloads bounded). */
const MULTICALL_CHUNK = 100;

/** Query freshness window shared with `lib/queries` (30 seconds). */
const STALE_TIME_MS = 30_000;

/** The per-act facts the dashboard aggregates on. */
type ActFact = { timestamp: bigint; revoked: boolean };

/**
 * Resolves {@link ActFact} for every `docHash` in at most one RPC round trip
 * per {@link MULTICALL_CHUNK} acts, via Multicall3. Missing acts (the
 * contract's `ActNotFound()` revert) are skipped.
 *
 * The query key includes the wallet `address`, so switching wallets resets
 * every per-act fact instead of leaking the previous notary's rows into the
 * aggregates.
 */
function useNotarialActFacts(
  address: Address | undefined,
  docHashes: Hex[] | undefined,
): ReturnType<typeof useQuery<Map<Hex, ActFact>>> {
  const client = usePublicClient();
  return useQuery<Map<Hex, ActFact>>({
    queryKey: ['notarialActFacts', address, docHashes],
    enabled: !!address && !!docHashes && docHashes.length > 0,
    staleTime: STALE_TIME_MS,
    queryFn: async () => {
      const registry = getNotaryRegistryAddress();
      const facts = new Map<Hex, ActFact>();
      const hashes = docHashes as Hex[];
      for (let start = 0; start < hashes.length; start += MULTICALL_CHUNK) {
        const chunk = hashes.slice(start, start + MULTICALL_CHUNK);
        const calls = await (client as PublicClient).multicall({
          contracts: chunk.map((docHash) => ({
            address: registry,
            abi: notaryRegistryAbi as Abi,
            functionName: 'getAct',
            args: [docHash],
          })),
          allowFailure: true,
        });
        chunk.forEach((docHash, index) => {
          const call = calls[index];
          if (call && call.status === 'success') {
            const act = call.result as unknown as NotarialAct;
            facts.set(docHash, { timestamp: act.timestamp, revoked: act.revoked });
          }
        });
      }
      return facts;
    },
  });
}

/**
 * One recent-act row: renders the pre-resolved {@link ActFact} for its
 * `docHash` (resolved once in {@link useNotarialActFacts}, not per row).
 */
function ActRow({ docHash, fact }: { docHash: Hex; fact: ActFact | undefined }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 transition-colors hover:border-gold/30 hover:bg-white/[0.06]">
      <HashChip value={docHash} href={`/verify/${docHash}`} label="Act" lead={8} tail={6} />
      <div className="flex items-center gap-3">
        {!fact ? (
          <Skeleton className="h-5 w-28 rounded-full" />
        ) : (
          <>
            <span className="hash-text text-xs text-mist">
              {format(fromUnixTime(Number(fact.timestamp)), 'MMM d, yyyy · HH:mm')}
            </span>
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                fact.revoked
                  ? 'border-wax/40 bg-wax/10 text-wax'
                  : 'border-success/40 bg-success/10 text-success',
              )}
            >
              {fact.revoked ? 'Revoked' : 'Recorded'}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

export function NotaryDashboard() {
  const { address, isConnected } = useAccount();
  const actsQuery = useNotaryActs(address);
  const commissionQuery = useNotaryCommission(address);
  const factsQuery = useNotarialActFacts(address, actsQuery.data);

  // Aggregates exclude revoked acts: a revoked act is not a completed
  // notarization and its fee is not earnings the notary keeps.
  const facts = factsQuery.data;
  const activeFacts = Array.from(facts?.values() ?? []).filter((fact) => !fact.revoked);
  const totalActs = activeFacts.length;
  const totalEarnings = BigInt(totalActs) * NOTARY_FEE;

  const thisMonthEarnings = (() => {
    const now = new Date();
    let count = 0;
    for (const fact of activeFacts) {
      const when = fromUnixTime(Number(fact.timestamp));
      if (when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth()) {
        count += 1;
      }
    }
    return BigInt(count) * NOTARY_FEE;
  })();

  const commission = commissionQuery.data ?? null;
  const commissionDaysLeft = commission
    ? Math.max(0, Number(commission.commissionExpiry) / 86_400 - Date.now() / 86_400)
    : 0;
  const commissionProgress = commission
    ? Math.min(100, Math.max(0, (commissionDaysLeft / COMMISSION_TERM_DAYS) * 100))
    : 0;
  const commissionStatus = !commission
    ? 'pending'
    : commission.active && commissionDaysLeft > 0
      ? 'active'
      : 'expired';

  const loading = actsQuery.isLoading || commissionQuery.isLoading || factsQuery.isLoading;
  const failed = actsQuery.isError || commissionQuery.isError || factsQuery.isError;
  const recent = (actsQuery.data ?? []).slice(-MAX_ROWS).reverse();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-10 pb-32 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">
            Notary dashboard
          </p>
          <h1 className="font-heading mt-2 text-3xl font-bold text-ink">Your notarial practice</h1>
        </div>
        {address ? (
          <NotaryBadge address={address} status={commissionStatus} />
        ) : (
          <WalletConnectButton />
        )}
      </div>

      {!isConnected ? (
        <div className="glass mt-12 flex flex-col items-center gap-4 p-12 text-center">
          <FileSignature className="size-12 text-gold" aria-hidden="true" />
          <h2 className="font-heading text-xl font-semibold text-ink">Connect your wallet</h2>
          <p className="max-w-sm text-mist">
            Connect the notary wallet to see your acts, earnings and commission status.
          </p>
          <WalletConnectButton />
        </div>
      ) : failed ? (
        <div
          className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-wax/40 bg-wax/10 p-10 text-center"
          role="alert"
        >
          <AlertTriangle className="size-10 text-wax" aria-hidden="true" />
          <div>
            <p className="font-heading text-lg font-semibold text-wax">Could not load your acts</p>
            <p className="mt-1 text-sm text-ink/80">The RPC endpoint did not respond.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void actsQuery.refetch();
              void commissionQuery.refetch();
              void factsQuery.refetch();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-white/5"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* 2×2 bento grid */}
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BentoCard
              title="Total acts"
              value={String(totalActs)}
              caption="all-time recorded on-chain (excluding revoked)"
              icon={<ListChecks className="size-5" />}
            />
            <BentoCard
              title="Earnings"
              value={`$${(Number(totalEarnings) / 1_000_000).toFixed(2)}`}
              caption={`this month: $${(Number(thisMonthEarnings) / 1_000_000).toFixed(2)} USDC`}
              icon={<Coins className="size-5" />}
            />
            <BentoCard
              title="Commission status"
              value={commission ? (commissionDaysLeft > 0 ? 'Active' : 'Expired') : 'Not registered'}
              caption={
                commission
                  ? `expires ${format(fromUnixTime(Number(commission.commissionExpiry)), 'MMM d, yyyy')}`
                  : 'register your commission to start'
              }
              icon={<CalendarDays className="size-5" />}
            >
              {commission ? (
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label="Commission time remaining"
                  aria-valuenow={Math.round(commissionProgress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${commissionProgress}%` }}
                    transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                    className={cn(
                      'h-full rounded-full',
                      commissionDaysLeft > 0 ? 'bg-gold' : 'bg-wax',
                    )}
                  />
                </div>
              ) : null}
            </BentoCard>
            <BentoCard title="Recent acts" icon={<FileSignature className="size-5" />}>
              {recent.length === 0 ? (
                <p className="mt-2 text-sm text-mist">
                  No acts yet — notarize your first document to see it here.
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-2">
                  {recent.slice(0, 3).map((docHash) => (
                    <ActRow key={docHash} docHash={docHash} fact={facts?.get(docHash)} />
                  ))}
                </ul>
              )}
            </BentoCard>
          </div>

          {/* Full recent acts list */}
          <section className="mt-12" aria-label="Recent notarial acts">
            <h2 className="font-heading text-xl font-semibold text-ink">All recent acts</h2>
            {recent.length === 0 ? (
              <div className="glass mt-4 flex flex-col items-center gap-3 p-10 text-center">
                <p className="text-mist">
                  Zero acts recorded — your notarizations will appear here with their hashes,
                  timestamps and status.
                </p>
                <Link
                  href="/notarize"
                  className={cn(
                    buttonVariants({ variant: 'default' }),
                    'h-11 rounded-xl bg-gold px-5 font-semibold text-navy hover:bg-gold/90',
                  )}
                >
                  Notarize a document
                </Link>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-2.5">
                {recent.map((docHash) => (
                  <ActRow key={docHash} docHash={docHash} fact={facts?.get(docHash)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Gold FAB */}
      <Link
        href="/notarize"
        aria-label="Notarize for a client"
        className={cn(
          'fixed right-5 bottom-20 z-30 inline-flex h-13 items-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-semibold text-navy shadow-lg transition-transform hover:scale-105 active:scale-95 lg:bottom-8',
          'glow-gold',
        )}
      >
        <Plus className="size-5" aria-hidden="true" />
        Notarize for client
      </Link>

      {loading ? (
        <span className="sr-only" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading dashboard
        </span>
      ) : null}
    </div>
  );
}
