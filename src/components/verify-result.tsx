'use client';

/**
 * The verify "wow moment" — 100% custom:
 * gold radial glow, the animated verdict stamp, the Etherscan-style meta row,
 * the 4-node chain-of-custody timeline with a +120ms cascade, and share-by-QR.
 * Loads its data from GET /api/verify/[docHash] (single source of truth),
 * forwarding `?uid=` so attestation-UID lookups pin their attestation through
 * the verify API's uid support.
 */
import { format, formatDistanceToNow, fromUnixTime } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSearch,
  ShieldAlert,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { usePublicClient } from 'wagmi';

import type { VerifyResponse } from '@/app/api/_lib/verify-types';
import { NOTARY_FEE, PROTOCOL_FEE, TOTAL_FEE } from '@/lib/usdc';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  basescanAddressUrl,
  basescanTxUrl,
  easscanAttestationUrl,
  formatUsdc,
  unpackBytes32,
} from './encoding';
import {
  ChainOfCustodyTimeline,
  type CustodyStep,
} from './chain-of-custody-timeline';
import { HashChip } from './hash-chip';
import { resolveActLookup } from './verify-search';
import { VerdictStamp } from './verdict-stamp';

/**
 * `invalid` is terminal: a 400 means the key can never resolve, so the state
 * offers no retry — only a way back to search. `error` stays retryable (RPC or
 * API trouble that a retry can genuinely fix).
 */
type LoadState = 'loading' | 'error' | 'invalid' | 'notFound' | 'ready';

const OTS_VERIFIER_URL = 'https://opentimestamps.org/';

/** bytes32 hex shape shared by doc hashes and attestation UIDs. */
const BYTES32_RE = /^0x[0-9a-f]{64}$/;

export function VerifyResult({ docHash }: { docHash: string }) {
  const client = usePublicClient();
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  // The key shown for this result — updated when a UID-in-URL lookup resolves
  // to the act's document hash.
  const [lookupKey, setLookupKey] = useState(docHash);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setState('loading');
      try {
        const uidParam = new URLSearchParams(window.location.search).get('uid');
        let path = docHash;
        let uid = uidParam && BYTES32_RE.test(uidParam.toLowerCase()) ? uidParam.toLowerCase() : undefined;
        const apiUrl = () =>
          `/api/verify/${encodeURIComponent(path)}${uid ? `?uid=${uid}` : ''}`;

        let response = await fetch(apiUrl(), { signal });

        // A 404 can mean the URL carries an EAS attestation UID instead of a
        // document hash: resolve it and retry through the verify API's uid
        // support (document hash in the path, `?uid=` pinning the attestation).
        if (response.status === 404 && !uid) {
          const resolved = await resolveActLookup(client, docHash);
          if (resolved.docHash && resolved.uid) {
            path = resolved.docHash;
            uid = resolved.uid;
            setLookupKey(path);
            window.history.replaceState(null, '', resolved.href);
            setShareUrl(window.location.href);
            response = await fetch(apiUrl(), { signal });
          }
        }

        if (response.status === 400) {
          setState('invalid');
          return;
        }
        if (response.status === 404) {
          setState('notFound');
          return;
        }
        if (!response.ok) {
          setState('error');
          return;
        }
        const payload = (await response.json()) as VerifyResponse;
        setData(payload);
        setState('ready');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState('error');
      }
    },
    [docHash, client],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, [docHash]);

  // The document title must never claim "Verified authentic" for a revoked act
  // (or before the verdict is known), so it is driven by the resolved state.
  useEffect(() => {
    if (state === 'ready' && data) {
      document.title = data.act.revoked
        ? 'Revoked — OpenNotary'
        : 'Verified authentic — OpenNotary';
      return;
    }
    if (state === 'notFound') {
      document.title = 'No notarial act found — OpenNotary';
    } else if (state === 'invalid') {
      document.title = 'Invalid lookup — OpenNotary';
    } else if (state === 'error') {
      document.title = 'Verification failed — OpenNotary';
    } else {
      document.title = 'Verifying… — OpenNotary';
    }
  }, [state, data]);

  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Verify URL copied to clipboard');
    } catch {
      toast.error('Could not copy — copy the URL from the address bar');
    }
  }

  return (
    <div className="relative overflow-hidden">
      {/* Subtle gold radial glow at top center */}
      <div aria-hidden="true" className="radial-gold pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6">
        {state === 'loading' ? (
          <div className="flex flex-col items-center gap-8" role="status" aria-label="Loading the notarial act">
            <Skeleton className="size-52 rounded-full" />
            <Skeleton className="h-12 w-72" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <div className="flex w-full flex-col gap-4">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
            <span className="sr-only">Loading the notarial act…</span>
          </div>
        ) : null}

        {state === 'error' ? (
          <div
            className="mx-auto mt-16 flex max-w-md flex-col items-center gap-5 rounded-2xl border border-wax/40 bg-wax/10 p-10 text-center"
            role="alert"
          >
            <Undo2 className="size-10 text-wax" aria-hidden="true" />
            <div>
              <h1 className="font-heading text-2xl font-bold text-wax">Verification failed</h1>
              <p className="mt-2 text-ink/80">
                The verification API did not respond. Your document is unaffected — retry in a
                moment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-white/20 px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-white/5"
            >
              Retry verification
            </button>
          </div>
        ) : null}

        {state === 'invalid' ? (
          <div
            className="mx-auto mt-16 flex max-w-md flex-col items-center gap-5 text-center"
            role="alert"
          >
            <ShieldAlert className="size-14 text-wax" aria-hidden="true" />
            <h1 className="font-heading text-3xl font-bold text-ink">Invalid lookup key</h1>
            <p className="text-mist">
              The value in the URL is not a valid document hash (bytes32) or EAS attestation UID, so
              it can never resolve to a notarial act. Check the value and search again.
            </p>
            <Link
              href="/verify"
              className={cn(
                buttonVariants({ variant: 'default' }),
                'h-12 rounded-xl bg-gold px-6 font-semibold text-navy hover:bg-gold/90 glow-gold',
              )}
            >
              Search again
            </Link>
          </div>
        ) : null}

        {state === 'notFound' ? (
          <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-5 text-center">
            <FileSearch className="size-14 text-mist" aria-hidden="true" />
            <h1 className="font-heading text-3xl font-bold text-ink">No notarial act found</h1>
            <p className="text-mist">
              Nothing on-chain matches{' '}
              <span className="hash-text text-ink">{lookupKey.slice(0, 10)}…</span>. Check the hash,
              or notarize the document now.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/verify"
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  'h-12 rounded-xl border-white/25 px-6 text-ink hover:bg-white/5',
                )}
              >
                Search again
              </Link>
              <Link
                href="/notarize"
                className={cn(
                  buttonVariants({ variant: 'default' }),
                  'h-12 rounded-xl bg-gold px-6 font-semibold text-navy hover:bg-gold/90 glow-gold',
                )}
              >
                Notarize a document
              </Link>
            </div>
          </div>
        ) : null}

        {state === 'ready' && data ? (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="flex flex-col items-center"
            >
              <VerdictStamp variant={data.act.revoked ? 'revoked' : 'verified'} size={220} />

              <h1
                className={cn(
                  'font-heading mt-6 text-4xl font-bold italic sm:text-5xl',
                  data.act.revoked ? 'text-wax' : 'text-ink',
                )}
              >
                {data.act.revoked ? 'Revoked' : 'Verified authentic'}
              </h1>
              <p className="mt-3 max-w-lg text-center text-mist">{verdictCopy(data)}</p>

              {/* Etherscan-style meta row */}
              <div className="glass mt-10 w-full p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <HashChip value={data.docHash} label="Doc hash" lead={10} tail={8} />
                  {data.act.docHash.toLowerCase() === lookupKey.toLowerCase() ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-success uppercase">
                      <CheckCircle2 className="size-3" aria-hidden="true" />
                      Matches URL
                    </span>
                  ) : null}
                </div>
                <p className="hash-text mt-2 text-xs break-all text-mist">{data.act.docHash}</p>

                <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <dt className="text-xs font-semibold tracking-[0.14em] text-mist uppercase">
                      Notary
                    </dt>
                    <dd>
                      <HashChip
                        value={data.act.notary}
                        href={basescanAddressUrl(data.act.notary)}
                        lead={8}
                        tail={6}
                      />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <dt className="text-xs font-semibold tracking-[0.14em] text-mist uppercase">
                      Signer
                    </dt>
                    <dd>
                      <HashChip
                        value={data.act.signer}
                        href={basescanAddressUrl(data.act.signer)}
                        lead={8}
                        tail={6}
                      />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <dt className="text-xs font-semibold tracking-[0.14em] text-mist uppercase">
                      Timestamp
                    </dt>
                    <dd className="text-sm text-ink">
                      {format(fromUnixTime(Number(data.act.timestamp)), 'PPpp')}
                      <span className="ml-2 text-xs text-mist">
                        ({formatDistanceToNow(fromUnixTime(Number(data.act.timestamp)), { addSuffix: true })})
                      </span>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <dt className="text-xs font-semibold tracking-[0.14em] text-mist uppercase">
                      Fee settled
                    </dt>
                    <dd className="text-sm text-ink">
                      {formatUsdc(TOTAL_FEE)} USDC
                      <span className="ml-2 text-xs text-mist">
                        ({formatUsdc(NOTARY_FEE)} notary + {formatUsdc(PROTOCOL_FEE)} protocol)
                      </span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-mist">
                    Doc type: <span className="text-ink">{unpackBytes32(data.act.docType)}</span>
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-mist">
                    Jurisdiction:{' '}
                    <span className="text-ink uppercase">{unpackBytes32(data.act.stateCode)}</span>
                  </span>
                </div>
              </div>

              {/* Chain of custody */}
              <div className="mt-12 w-full">
                <h2 className="font-heading text-2xl font-bold text-ink">Chain of custody</h2>
                <p className="mt-2 text-mist">
                  Every step below is independently verifiable — from the IPFS pin to the Bitcoin
                  block.
                </p>
                <ChainOfCustodyTimeline className="mt-8" steps={buildSteps(data)} />
              </div>

              {/* Share */}
              <div className="glass mt-12 flex w-full flex-col items-center gap-6 p-6 sm:flex-row">
                <div className="flex flex-1 flex-col items-start gap-3">
                  <h2 className="font-heading text-lg font-semibold text-ink">
                    Share this verify URL
                  </h2>
                  <p className="text-sm text-mist">
                    Anyone with the link sees exactly what you see — the stamp, the hashes and the
                    anchors.
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyShareUrl()}
                    className={cn(
                      buttonVariants({ variant: 'default' }),
                      'h-11 rounded-xl bg-gold px-5 font-semibold text-navy hover:bg-gold/90',
                    )}
                    aria-label="Copy the verify URL to the clipboard"
                  >
                    <Copy className="size-4" aria-hidden="true" />
                    Copy verify URL
                  </button>
                </div>
                {shareUrl ? (
                  <div className="rounded-2xl border border-white/10 bg-navy p-3">
                    <QRCodeSVG
                      value={shareUrl}
                      size={148}
                      bgColor="#0A0F1A"
                      fgColor="#C8A968"
                      level="M"
                      aria-label="QR code linking to this verify page"
                    />
                  </div>
                ) : (
                  <Skeleton className="size-[172px] rounded-2xl" />
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Verdict copy that never overclaims: a revoked act says so, and the Bitcoin
 * anchor is only called intact while its OTS status is actually `verified` —
 * a pending anchor is described as pending.
 */
function verdictCopy(data: VerifyResponse): string {
  if (data.act.revoked) {
    return 'This notarial act has been revoked on-chain and should no longer be relied upon.';
  }
  const signed = data.attestation
    ? 'both signatures and the EAS attestation are intact'
    : 'both signatures are intact';
  const anchor =
    data.ots.status === 'verified'
      ? 'the Bitcoin anchor below is intact.'
      : 'the Bitcoin anchor below is pending and finalizes into a Bitcoin block within ~24h.';
  return `This document was notarized on-chain — ${signed}; ${anchor}`;
}

/** Builds the four custody steps from the verify payload. */
function buildSteps(data: VerifyResponse): CustodyStep[] {
  const verifiedAnchor = data.ots.status === 'verified';
  return [
    {
      id: 'ipfs',
      icon: 'ipfs',
      title: 'Document uploaded',
      status: 'done',
      children: (
        <>
          <HashChip value={data.act.ipfsCid} label="IPFS CID hash" lead={10} tail={8} />
          {data.ipfsUri ? (
            <a
              href={data.ipfsUri}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gold transition-colors hover:text-gold/80"
            >
              Open on the IPFS gateway
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-xs text-mist">
              Content-addressed pin reference — gateway link available after pinning.
            </p>
          )}
        </>
      ),
    },
    {
      id: 'ethereum',
      icon: 'ethereum',
      title: 'Ethereum anchored',
      status: 'done',
      children: (
        <>
          {data.txHash ? (
            <HashChip value={data.txHash} label="Tx hash" href={basescanTxUrl(data.txHash)} lead={10} tail={8} />
          ) : (
            <p className="text-xs text-mist">Recorded via NotaryRegistry on Base Sepolia.</p>
          )}
          <p className="text-xs text-mist">
            {format(fromUnixTime(Number(data.act.timestamp)), 'PPpp')} · Base Sepolia (chain
            84532)
          </p>
        </>
      ),
    },
    {
      id: 'bitcoin',
      icon: 'bitcoin',
      // Pending proofs render the amber "Pending" state and are never titled
      // or described as anchored/intact.
      title: verifiedAnchor ? 'Bitcoin anchored' : 'Bitcoin anchor',
      status: verifiedAnchor ? 'done' : 'pending',
      children: (
        <>
          <p className="text-xs text-mist">
            {data.ots.status === 'verified'
              ? `OpenTimestamps proof verified in Bitcoin block ${data.ots.bitcoinBlockHeight ?? '—'}.`
              : 'OpenTimestamps proof is pending at the calendar network — it finalizes into a Bitcoin block within ~24h.'}
          </p>
          <a
            href={OTS_VERIFIER_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gold transition-colors hover:text-gold/80"
          >
            Verify at opentimestamps.org
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </>
      ),
    },
    {
      id: 'witness',
      icon: 'witness',
      title: 'Witness co-signed',
      status: data.attestation ? 'done' : 'skipped',
      children: data.attestation ? (
        <>
          <HashChip
            value={data.attestation.uid}
            label="Attestation UID"
            href={easscanAttestationUrl(data.attestation.uid)}
            lead={10}
            tail={8}
          />
          <p className="text-xs text-mist">
            EAS NotarialAct schema · attested{' '}
            {format(fromUnixTime(Number(data.attestation.time)), 'PPpp')}
          </p>
        </>
      ) : (
        <p className="text-xs text-mist">
          No witness attestation recorded for this act — the dual on-chain signatures remain the
          source of truth.
        </p>
      ),
    },
  ];
}
