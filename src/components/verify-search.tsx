'use client';

/**
 * Verify search: one field that accepts a bytes32 doc hash or an EAS
 * attestation UID (`verifySchema`), routes to /verify/[docHash], and shows
 * recent lookups plus a quick demo link.
 *
 * EAS attestation UIDs are first-class: an input that resolves to an
 * attestation is routed to its act's document hash with `?uid=`, so the verify
 * API's uid support pins the exact attestation to the result — not just a
 * document hash lookup.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { keccak256, toBytes, zeroHash, type Hex, type PublicClient } from 'viem';
import { motion } from 'framer-motion';
import { Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { usePublicClient } from 'wagmi';

import { verifySchema, type VerifyInput } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { HashChip } from './hash-chip';

/** Deterministic demo lookup so the quick-links row always has a target. */
const DEMO_DOC_HASH = keccak256(toBytes('opennotary-demo-act'));

/** localStorage key holding the visitor's recent lookups. */
const RECENTS_KEY = 'opennotary.recentVerify';

/** Maximum recent lookups displayed. */
const MAX_RECENTS = 4;

/** bytes32 hex shape shared by doc hashes and attestation UIDs. */
const BYTES32_RE = /^0x[0-9a-f]{64}$/;

/** Base Sepolia EAS predeploy — mirrors `lib/attest`. */
const DEFAULT_EAS_CONTRACT = '0x4200000000000000000000000000000000000021';

/**
 * Minimal `IEAS.getAttestation` read surface, used to resolve an attestation
 * UID to the document hash committed in its schema data.
 */
const EAS_GET_ATTESTATION_ABI = [
  {
    type: 'function',
    name: 'getAttestation',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'uid', type: 'bytes32' },
          { name: 'schema', type: 'bytes32' },
          { name: 'attester', type: 'address' },
          { name: 'recipient', type: 'address' },
          { name: 'time', type: 'uint64' },
          { name: 'expirationTime', type: 'uint64' },
          { name: 'revocationTime', type: 'uint64' },
          { name: 'revocable', type: 'bool' },
          { name: 'refUID', type: 'bytes32' },
          { name: 'data', type: 'bytes' },
          { name: 'value', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

/** A search input resolved to the route that renders its chain of custody. */
export type ActLookup = {
  /** Normalized lookup key the visitor typed. */
  value: string;
  /** Document hash of the act, or `null` when the key isn't an act UID. */
  docHash: Hex | null;
  /** The attestation UID, when the key resolved as one. */
  uid: Hex | null;
  /** Verify route: `/verify/[docHash]`, carrying `?uid=` for UID lookups. */
  href: string;
};

/**
 * Resolves a search key to its verify route.
 *
 * A key that resolves to an EAS attestation is routed through the verify API's
 * uid support — the act's document hash in the path plus `?uid=` pinning the
 * attestation. Anything else routes as a plain document hash.
 */
export async function resolveActLookup(
  client: PublicClient | undefined,
  rawValue: string,
): Promise<ActLookup> {
  const value = (rawValue.startsWith('0x') ? rawValue : `0x${rawValue}`).toLowerCase();
  const asDocHash: ActLookup = { value, docHash: null, uid: null, href: `/verify/${value}` };
  if (!client || !BYTES32_RE.test(value)) {
    return asDocHash;
  }
  try {
    const attestation = (await client.readContract({
      address: (process.env.NEXT_PUBLIC_EAS_CONTRACT ?? DEFAULT_EAS_CONTRACT) as Hex,
      abi: EAS_GET_ATTESTATION_ABI,
      functionName: 'getAttestation',
      args: [value as Hex],
    })) as { uid: Hex; schema: Hex; data: Hex };
    if (!attestation?.uid || attestation.uid.toLowerCase() === zeroHash) {
      return asDocHash;
    }
    // Only NotarialAct attestations map to acts; anything else (e.g. a
    // commission UID) is not a valid act lookup key.
    const actSchema = process.env.NEXT_PUBLIC_EAS_SCHEMA_UID_ACT;
    if (actSchema && attestation.schema.toLowerCase() !== actSchema.toLowerCase()) {
      return asDocHash;
    }
    // The NotarialAct schema commits `docHash` as its first (static) field,
    // so the first 32 bytes of the ABI-encoded data are the document hash.
    const docHash = `0x${attestation.data.slice(2, 66).toLowerCase()}`;
    if (!BYTES32_RE.test(docHash)) {
      return asDocHash;
    }
    return {
      value,
      docHash: docHash as Hex,
      uid: value as Hex,
      href: `/verify/${docHash}?uid=${value}`,
    };
  } catch {
    return asDocHash;
  }
}

/** A remembered lookup: the key the visitor typed plus its resolved route. */
type RecentLookup = { value: string; href: string };

/** Parses stored recents, accepting legacy plain-string entries. */
function parseRecents(stored: string): RecentLookup[] {
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry): RecentLookup | null => {
        if (typeof entry === 'string') {
          return { value: entry, href: `/verify/${entry}` };
        }
        const record = entry as { value?: unknown; href?: unknown } | null;
        if (record && typeof record.value === 'string' && typeof record.href === 'string') {
          return { value: record.value, href: record.href };
        }
        return null;
      })
      .filter((entry): entry is RecentLookup => entry !== null);
  } catch {
    return [];
  }
}

export function VerifySearch() {
  const router = useRouter();
  const client = usePublicClient();
  const [recents, setRecents] = useState<RecentLookup[]>([]);
  const [resolving, setResolving] = useState(false);

  const form = useForm<VerifyInput>({
    resolver: zodResolver(verifySchema),
    defaultValues: { docHashOrUid: '' },
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENTS_KEY);
      if (stored) {
        setRecents(parseRecents(stored));
      }
    } catch {
      setRecents([]);
    }
  }, []);

  function remember(lookup: RecentLookup) {
    setRecents((prev) => {
      const next = [lookup, ...prev.filter((entry) => entry.value !== lookup.value)].slice(
        0,
        MAX_RECENTS,
      );
      try {
        window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode) — recents stay in memory only.
      }
      return next;
    });
  }

  async function onSubmit(values: VerifyInput) {
    const normalized = (
      values.docHashOrUid.startsWith('0x') ? values.docHashOrUid : `0x${values.docHashOrUid}`
    ).toLowerCase();
    if (!verifySchema.safeParse({ docHashOrUid: normalized }).success) {
      toast.error('That is not a valid bytes32 hash or attestation UID');
      return;
    }
    setResolving(true);
    try {
      // Attestation UIDs route to their act's document hash with `?uid=`, so
      // the lookup works end-to-end instead of being mistaken for a doc hash.
      const lookup = await resolveActLookup(client, normalized);
      remember({ value: lookup.value, href: lookup.href });
      router.push(lookup.href);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-16 sm:px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <Search className="size-12 text-gold" aria-hidden="true" />
        </motion.div>
        <h1 className="font-heading text-4xl font-bold text-ink">Verify a document</h1>
        <p className="max-w-md text-mist">
          Paste the document hash (bytes32) or the EAS attestation UID to open its full chain of
          custody.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
          <FormField
            control={form.control}
            name="docHashOrUid"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Document hash or attestation UID</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="0x…"
                    aria-label="Document hash or attestation UID"
                    className="hash-text h-12 text-base"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            disabled={resolving}
            className="h-12 rounded-xl bg-gold text-base font-semibold text-navy hover:bg-gold/90 glow-gold"
          >
            <Search aria-hidden="true" />
            {resolving ? 'Looking up…' : 'Verify'}
          </Button>
        </form>
      </Form>

      {/* Quick demo + recent lookups */}
      <div className="flex flex-col gap-4">
        <Link
          href={`/verify/${DEMO_DOC_HASH}`}
          className={cn(
            'flex items-center justify-between gap-3 rounded-2xl border border-gold/25 bg-gold/[0.07] px-5 py-4 transition-colors hover:border-gold/50',
          )}
          aria-label="Open the demo verification"
        >
          <span className="flex items-center gap-2.5 text-sm font-medium text-gold">
            <Sparkles className="size-4" aria-hidden="true" />
            Quick demo — see the chain of custody
          </span>
          <span className="hash-text text-xs text-gold/80">{DEMO_DOC_HASH.slice(0, 12)}…</span>
        </Link>

        {recents.length > 0 ? (
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-mist uppercase">Recent</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {recents.map((lookup) => (
                <li key={lookup.value}>
                  <HashChip value={lookup.value} href={lookup.href} lead={8} tail={6} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-mist">Your recent lookups will appear here.</p>
        )}
      </div>
    </div>
  );
}
