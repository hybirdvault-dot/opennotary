'use client';

/**
 * The 3-step notarize wizard (one step per screen on mobile):
 *
 * 1. Upload — drag-drop zone with gold glow; the document is pinned to IPFS
 *    (real w3up CID) FIRST on file pick, then a deterministic filename-based
 *    doc-type suggestion is offered (editable); docType/stateCode/signer fields
 *    are validated by `notarizeSchema`.
 * 2. Sign — wallet connect, USDC `approveUsdc(TOTAL_FEE)` when allowance is
 *    low, then the two EIP-712 signatures after a bottom-sheet typed-data
 *    summary. Both signatures bind the SAME real CID's `ipfsCid` (from the
 *    step-1 upload), the committed fee/deadline and on-chain nonces. All
 *    signing is client-side via `lib/eip712`.
 * 3. Confirm — sequential progress beats (Recording on-chain → Attesting via
 *    EAS → Anchoring on Bitcoin), then the success state with the doc hash and
 *    verify/Basescan CTAs.
 *
 * Chain-of-custody: the CID that is SIGNED is the CID that is UPLOADED and the
 * CID shown in the gateway link — never a fabricated one.
 *
 * Page files stay thin: every flow lives here and in the `src/lib/` wrappers.
 */
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bitcoin,
  Blocks,
  Check,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FileText,
  Loader2,
  PenLine,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { keccak256, type Address, type Hex, type PublicClient } from 'viem';
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from 'wagmi';

import { submitNotarizeAction, uploadDocumentAction } from '@/app/notarize/actions';
import {
  buildEip712Domain,
  buildNotaryAttestationMessage,
  buildSignerAcknowledgmentMessage,
  signNotaryAttestation,
  signSignerAcknowledgment,
} from '@/lib/eip712';
import { getNonce, getNotaryRegistryAddress, writeNotarize } from '@/lib/contract';
import { notarizeSchema } from '@/lib/schemas';
import { cidToBytes32 } from '@/lib/storage';
import { allowanceOf, approveUsdc, NOTARY_FEE, PROTOCOL_FEE, TOTAL_FEE } from '@/lib/usdc';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  basescanTxUrl,
  formatUsdc,
  ipfsGatewayUrl,
  packBytes32,
  truncateMiddle,
} from './encoding';
import { HashChip } from './hash-chip';
import { NotarySeal } from './notary-seal';
import { WalletConnectButton } from './wallet-connect-button';

type WizardStep = 1 | 2 | 3;

type SigningInputs = {
  docHash: Hex;
  ipfsCid: Hex;
  timestamp: bigint;
  fee: bigint;
  deadline: bigint;
};

type SignedPayload = SigningInputs & {
  notarySig: Hex;
  signerSig: Hex;
  notaryNonce: bigint;
  signerNonce: bigint;
};

type PipelineState = {
  beat: number;
  txHash: Hex | null;
};

type PipelineResult = {
  docHash: Hex;
  txHash: Hex;
  attestationUid: Hex;
  ipfsUri: string | null;
};

const BASE_SEPOLIA_CHAIN_ID = 84532;

const DOC_TYPE_OPTIONS = [
  'Power of Attorney',
  'Affidavit',
  'Bill of Sale',
  'Deed',
  'Last Will & Testament',
  'Contract / Agreement',
  'General notarial act',
] as const;

const BEATS = [
  { label: 'Uploading to IPFS', icon: CloudUpload },
  { label: 'Recording on-chain', icon: Blocks },
  { label: 'Attesting via EAS', icon: BadgeCheck },
  { label: 'Anchoring on Bitcoin', icon: Bitcoin },
] as const;

/** Shared button styling for link-shaped CTAs (Base UI Button has no asChild). */
const linkButtonClass =
  'inline-flex h-12 items-center justify-center gap-2 px-6 text-base font-medium transition-colors';

/** Deterministic document-type suggestion derived from the file name. */
function suggestDocType(fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.includes('poa') || name.includes('power')) return 'Power of Attorney';
  if (name.includes('affidavit')) return 'Affidavit';
  if (name.includes('bill') || name.includes('sale')) return 'Bill of Sale';
  if (name.includes('deed')) return 'Deed';
  if (name.includes('will') || name.includes('testament')) return 'Last Will & Testament';
  if (name.includes('contract') || name.includes('agreement')) return 'Contract / Agreement';
  return 'General notarial act';
}

/** Maps low-level wallet/API failures to friendly wizard messages. */
function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes('reject') || lower.includes('denied') || lower.includes('cancel')) {
    return 'Signature rejected — confirm the request in your wallet to continue.';
  }
  if (lower.includes('insufficient funds') || lower.includes('insufficient balance')) {
    return 'Insufficient ETH for gas on Base Sepolia — top up and retry.';
  }
  // Only genuine chain-switch / wrong-network errors map to "Wrong network".
  // Everything else surfaces its real message (never swallow it).
  if (
    lower.includes('chain mismatch') ||
    lower.includes('chainmismatch') ||
    lower.includes('wrong chain') ||
    lower.includes('chain does not match') ||
    lower.includes('unsupported chain') ||
    lower.includes('switch chain') ||
    lower.includes('chain not configured') ||
    lower.includes('unknown chain') ||
    lower.includes('chainid mismatch')
  ) {
    return 'Wrong network — switch to Base Sepolia and retry.';
  }
  return message.length > 160 ? 'The wallet request failed — please retry.' : message;
}

const stepVariants = {
  hidden: { opacity: 0, x: 32 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 280, damping: 26 },
  },
  exit: { opacity: 0, x: -32, transition: { duration: 0.18 } },
};

export function NotarizeWizard() {
  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 — upload (the document is pinned to IPFS first, on file pick)
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>(DOC_TYPE_OPTIONS[0]);
  const [stateCode, setStateCode] = useState('');
  const [signerAddress, setSignerAddress] = useState('');
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadedCid, setUploadedCid] = useState<string | null>(null);
  const [docHash, setDocHash] = useState<Hex | null>(null);
  const [ipfsCid, setIpfsCid] = useState<Hex | null>(null);
  const [suggestedType, setSuggestedType] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Step 2 — sign
  const [signingInputs, setSigningInputs] = useState<SigningInputs | null>(null);
  const [signedPayload, setSignedPayload] = useState<SignedPayload | null>(null);
  const [nonces, setNonces] = useState<{ notary: bigint; signer: bigint } | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [allowanceLoading, setAllowanceLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Step 3 — confirm
  const [pipeline, setPipeline] = useState<PipelineState>({ beat: 0, txHash: null });
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);

  const { address, chainId, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  let registryAddress: Address | null = null;
  try {
    registryAddress = getNotaryRegistryAddress();
  } catch {
    registryAddress = null;
  }

  const wrongChain = isConnected && chainId !== BASE_SEPOLIA_CHAIN_ID;
  const allowanceOk = allowance !== null && allowance >= TOTAL_FEE;
  const signerMatches =
    !!address && signerAddress.toLowerCase() === address.toLowerCase();

  const refreshAllowance = useCallback(async () => {
    if (!publicClient || !address || !registryAddress) return;
    setAllowanceLoading(true);
    try {
      const next = await allowanceOf(publicClient as PublicClient, {
        owner: address,
        spender: registryAddress,
      });
      setAllowance(next);
    } catch (err) {
      setAllowance(null);
      toast.error(friendlyError(err));
    } finally {
      setAllowanceLoading(false);
    }
  }, [publicClient, address, registryAddress]);

  // Build the EIP-712 message inputs once the signing step opens, binding the
  // SAME real CID-derived ipfsCid plus the committed fee and deadline.
  useEffect(() => {
    if (step !== 2 || !docHash || !ipfsCid || signingInputs) return;
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    setSigningInputs({
      docHash,
      ipfsCid,
      timestamp,
      fee: TOTAL_FEE,
      deadline: timestamp + 3_600n,
    });
  }, [step, docHash, ipfsCid, signingInputs]);

  // Read the on-chain replay nonces before signing (never a hardcoded 0n).
  useEffect(() => {
    if (step !== 2 || !publicClient || !registryAddress || !address || !signerAddress) return;
    let cancelled = false;
    void (async () => {
      try {
        const [notary, signer] = await Promise.all([
          getNonce(publicClient as PublicClient, address),
          getNonce(publicClient as PublicClient, signerAddress as Address),
        ]);
        if (!cancelled) setNonces({ notary, signer });
      } catch (err) {
        if (!cancelled) toast.error(friendlyError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, publicClient, registryAddress, address, signerAddress]);

  useEffect(() => {
    if (step === 2 && isConnected && registryAddress) {
      void refreshAllowance();
    }
  }, [step, isConnected, registryAddress, refreshAllowance]);

  function acceptFile(nextFile: File) {
    const parsed = notarizeSchema.shape.file.safeParse(nextFile);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid file';
      setFieldErrors((prev) => ({ ...prev, file: message }));
      toast.error(message);
      return;
    }
    setFieldErrors((prev) => ({ ...prev, file: '' }));
    setFile(nextFile);
    // A fresh file resets every derived value; the upload runs FIRST so the
    // signatures can commit to the REAL CID (no fabricated CIDs).
    setDocHash(null);
    setIpfsCid(null);
    setUploadedCid(null);
    setSigningInputs(null);
    setSignedPayload(null);
    setNonces(null);
    setUploadState('uploading');
    const suggestion = suggestDocType(nextFile.name);
    setDocType(suggestion);
    setSuggestedType(suggestion);
    void pinFile(nextFile);
  }

  /** Pins the file to IPFS and derives the docHash + ipfsCid that get signed. */
  async function pinFile(nextFile: File) {
    try {
      const bytes = new Uint8Array(await nextFile.arrayBuffer());
      const hash = keccak256(bytes);
      const upload = await uploadDocumentAction(nextFile);
      if (!upload.ok) {
        setUploadState('error');
        toast.error(upload.error);
        return;
      }
      setDocHash(hash);
      setUploadedCid(upload.cid);
      setIpfsCid(cidToBytes32(upload.cid));
      setUploadState('done');
    } catch (err) {
      setUploadState('error');
      toast.error(friendlyError(err));
    }
  }

  function validateStep1(): boolean {
    const parsed = notarizeSchema.safeParse({ file, docType, stateCode, signerAddress });
    if (parsed.success) {
      setFieldErrors({});
      return true;
    }
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      // Friendly copy in the form layer; the zod schema stays strict.
      const message = key === 'file' ? 'Please choose a document to notarize.' : issue.message;
      if (!errors[key]) errors[key] = message;
    }
    setFieldErrors(errors);
    return false;
  }

  async function handleApprove() {
    if (!walletClient || !registryAddress) return;
    setApproving(true);
    try {
      const hash = await approveUsdc(walletClient, {
        spender: registryAddress,
        amount: TOTAL_FEE,
      });
      toast.info('USDC approval submitted — waiting for confirmation…');
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      toast.success(`${formatUsdc(TOTAL_FEE)} USDC allowance approved`);
      await refreshAllowance();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setApproving(false);
    }
  }

  async function handleSign() {
    const signingAccount = walletClient?.account;
    if (!walletClient || !signingAccount || !address || !signingInputs || !registryAddress) return;
    if (!publicClient) return;
    setSigning(true);
    setSignError(null);
    try {
      const domain = buildEip712Domain(BASE_SEPOLIA_CHAIN_ID, registryAddress);
      const packedDocType = packBytes32(docType);
      const packedStateCode = packBytes32(stateCode.toUpperCase());

      // Fresh on-chain replay nonces right before signing (kills the 0n bug).
      const notaryNonce = await getNonce(publicClient as PublicClient, address);
      const signerNonce = await getNonce(publicClient as PublicClient, signerAddress as Address);
      setNonces({ notary: notaryNonce, signer: signerNonce });

      const signerMessage = buildSignerAcknowledgmentMessage({
        docHash: signingInputs.docHash,
        notary: address,
        ipfsCid: signingInputs.ipfsCid,
        docType: packedDocType,
        stateCode: packedStateCode,
        fee: signingInputs.fee,
        timestamp: signingInputs.timestamp,
        deadline: signingInputs.deadline,
        nonce: signerNonce,
      });
      const signerSig = await signSignerAcknowledgment(walletClient, {
        account: signingAccount,
        domain,
        message: signerMessage,
      });

      const notaryMessage = buildNotaryAttestationMessage({
        docHash: signingInputs.docHash,
        signer: signerAddress as Address,
        ipfsCid: signingInputs.ipfsCid,
        docType: packedDocType,
        stateCode: packedStateCode,
        fee: signingInputs.fee,
        timestamp: signingInputs.timestamp,
        deadline: signingInputs.deadline,
        nonce: notaryNonce,
      });
      const notarySig = await signNotaryAttestation(walletClient, {
        account: signingAccount,
        domain,
        message: notaryMessage,
      });

      setSignedPayload({ ...signingInputs, notarySig, signerSig, notaryNonce, signerNonce });
      setSheetOpen(false);
      toast.success('Both signatures captured');
      setPipeline({ beat: 0, txHash: null });
      setResult(null);
      setStep(3);
    } catch (err) {
      const message = friendlyError(err);
      setSignError(message);
      toast.error(message);
    } finally {
      setSigning(false);
    }
  }

  async function runPipeline() {
    if (!walletClient || !address || !signedPayload || !uploadedCid) return;
    setPipelineRunning(true);
    setPipelineError(null);
    // KILLER #1: the document was already pinned to IPFS at file pick, so this
    // pipeline covers on-chain → EAS → Bitcoin only — and every step uses the
    // SAME real CID that the signatures bound.
    const ipfsUri = ipfsGatewayUrl(uploadedCid);
    let txHash = pipeline.txHash;
    let attestationUid: Hex | null = null;
    // Resume pointer: 0 means "start at the first confirm beat" (beat 1).
    let current = pipeline.beat === 0 ? 1 : pipeline.beat;
    try {
      // Beat 1 — record the act on-chain (11-arg notarize).
      if (current === 1) {
        if (!registryAddress) {
          throw new Error('NEXT_PUBLIC_NOTARY_REGISTRY_ADDRESS is not set');
        }
        setPipeline({ beat: 1, txHash });
        txHash = await writeNotarize(walletClient, {
          docHash: signedPayload.docHash,
          notary: address,
          signer: signerAddress as Address,
          ipfsCid: signedPayload.ipfsCid,
          docType: packBytes32(docType),
          stateCode: packBytes32(stateCode.toUpperCase()),
          fee: signedPayload.fee,
          timestamp: signedPayload.timestamp,
          deadline: signedPayload.deadline,
          notarySig: signedPayload.notarySig,
          signerSig: signedPayload.signerSig,
        });
        current = 2;
        setPipeline({ beat: current, txHash });
      }

      // Beat 2 — attest via the API with the same real CID + ipfsUri.
      if (current === 2) {
        if (!txHash || txHash === '0x') {
          throw new Error('A confirmed transaction hash is required before submitting.');
        }
        const submit = await submitNotarizeAction({
          docHash: signedPayload.docHash,
          notary: address,
          signer: signerAddress,
          ipfsCid: signedPayload.ipfsCid,
          docType: packBytes32(docType),
          stateCode: packBytes32(stateCode.toUpperCase()),
          fee: signedPayload.fee.toString(),
          timestamp: signedPayload.timestamp.toString(),
          deadline: signedPayload.deadline.toString(),
          notarySig: signedPayload.notarySig,
          signerSig: signedPayload.signerSig,
          txHash,
          ipfsUri,
        });
        if (!submit.ok) {
          throw new Error(submit.error);
        }
        attestationUid = submit.attestationUid as Hex;
        current = 3;
        setPipeline({ beat: current, txHash });
      }

      // Beat 3 — Bitcoin anchor (queued fire-and-forget server-side); the beat
      // plays out while the calendar submission settles.
      if (current === 3) {
        if (!txHash || txHash === '0x') {
          throw new Error('A confirmed transaction hash is required.');
        }
        if (!attestationUid) {
          throw new Error('The attestation was not created.');
        }
        await new Promise((resolve) => {
          window.setTimeout(resolve, 900);
        });
        setPipeline({ beat: 4, txHash });
        setResult({
          docHash: signedPayload.docHash,
          txHash,
          attestationUid,
          ipfsUri,
        });
        toast.success('Notarization complete');
      }
    } catch (err) {
      const message = friendlyError(err);
      setPipelineError(message);
      // Keep the resume pointer on the beat that failed.
      setPipeline((prev) => ({ ...prev, beat: current, txHash }));
      toast.error(message);
    } finally {
      setPipelineRunning(false);
    }
  }

  const typedDataRows: Array<{ label: string; value: string }> = signingInputs
    ? [
        { label: 'domain.name', value: 'OpenNotary' },
        { label: 'domain.version', value: '1' },
        { label: 'domain.chainId', value: String(BASE_SEPOLIA_CHAIN_ID) },
        {
          label: 'domain.verifyingContract',
          value: registryAddress ?? 'unset',
        },
        { label: 'docHash', value: signingInputs.docHash },
        { label: 'signer', value: signerAddress },
        { label: 'notary', value: address ?? '' },
        { label: 'ipfsCid', value: signingInputs.ipfsCid },
        { label: 'docType', value: packBytes32(docType) },
        { label: 'stateCode', value: packBytes32(stateCode.toUpperCase()) },
        { label: 'fee', value: signingInputs.fee.toString() },
        { label: 'timestamp', value: signingInputs.timestamp.toString() },
        { label: 'deadline', value: signingInputs.deadline.toString() },
        {
          label: 'nonce',
          value: nonces ? `notary ${nonces.notary} · signer ${nonces.signer}` : 'loading…',
        },
      ]
    : [];

  return (
    <div className="relative mx-auto max-w-2xl px-4 pt-10 pb-40 sm:px-6">
      {/* Step indicator */}
      <ol className="flex items-center justify-between gap-2" aria-label="Notarization steps">
        {(['Upload', 'Sign', 'Confirm'] as const).map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const done = step > number;
          return (
            <li key={label} className="flex flex-1 flex-col items-center gap-2">
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  active
                    ? 'border-gold bg-gold/15 text-gold'
                    : done
                      ? 'border-success/50 bg-success/10 text-success'
                      : 'border-white/15 text-mist',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="size-4" aria-hidden="true" /> : number}
              </span>
              <span
                className={cn(
                  'text-xs font-medium',
                  active ? 'text-gold' : done ? 'text-ink' : 'text-mist',
                )}
              >
                {label}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  'h-0.5 w-full rounded-full transition-colors',
                  active ? 'bg-gold' : done ? 'bg-success/60' : 'bg-white/10',
                )}
              />
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div key="step-1" variants={stepVariants} initial="hidden" animate="show" exit="exit" className="mt-10">
            <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">
              Upload the document
            </h1>
            <p className="mt-2 text-mist">
              PDF or image, up to 25MB. Only its keccak256 hash goes on-chain.
            </p>

            {/* Drag & drop zone */}
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) acceptFile(dropped);
              }}
              className={cn(
                'mt-6 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all',
                dragActive
                  ? 'border-gold bg-gold/10 glow-gold scale-[1.01]'
                  : 'border-white/15 bg-white/[0.03] hover:border-gold/60 hover:bg-gold/[0.06]',
              )}
            >
              {file ? (
                <div className="flex w-full flex-col items-center gap-3">
                  <FileText className="size-10 text-gold" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-ink">{file.name}</p>
                    <p className="text-xs text-mist">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  {uploadState === 'uploading' ? (
                    <p className="flex items-center gap-2 text-sm text-gold">
                      <NotarySeal size={18} spinning />
                      Uploading to IPFS…
                    </p>
                  ) : uploadState === 'done' && uploadedCid ? (
                    <p className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-medium text-success">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Pinned · {truncateMiddle(uploadedCid, 10, 8)}
                    </p>
                  ) : uploadState === 'error' ? (
                    <p className="flex items-center gap-2 rounded-full border border-wax/40 bg-wax/10 px-3 py-1 text-xs font-medium text-wax">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      Upload failed — pick the file again to retry
                    </p>
                  ) : null}
                  {suggestedType ? (
                    <p className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
                      <Sparkles className="size-3.5" aria-hidden="true" />
                      Suggested from filename: {suggestedType}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setUploadedCid(null);
                      setDocHash(null);
                      setIpfsCid(null);
                      setSuggestedType(null);
                      setUploadState('idle');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-mist transition-colors hover:text-wax"
                    aria-label="Remove the selected file"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                    Remove file
                  </button>
                </div>
              ) : (
                <>
                  <CloudUpload className="size-10 text-gold" aria-hidden="true" />
                  <p className="font-medium text-ink">Drag &amp; drop your document</p>
                  <p className="text-sm text-mist">or choose a file below</p>
                </>
              )}

              <label
                htmlFor="notarize-file"
                className={cn(
                  'mt-2 inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-white/20 px-5 text-sm font-medium text-ink transition-colors hover:border-gold/60 hover:bg-white/5',
                )}
              >
                Choose file
                <input
                  id="notarize-file"
                  type="file"
                  className="sr-only"
                  aria-label="Choose a document to notarize"
                  onChange={(event) => {
                    const picked = event.target.files?.[0];
                    if (picked) acceptFile(picked);
                  }}
                />
              </label>
              {fieldErrors.file ? (
                <p className="text-xs text-wax" role="alert">
                  {fieldErrors.file}
                </p>
              ) : null}
            </div>

            {/* Document metadata */}
            <div className="mt-8 flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="doc-type">Document type</Label>
                <select
                  id="doc-type"
                  value={docType}
                  onChange={(event) => setDocType(event.target.value)}
                  className="h-11 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-ink outline-none focus-visible:border-gold"
                >
                  {DOC_TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option} className="bg-surface text-ink">
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors.docType ? (
                  <p className="text-xs text-wax" role="alert">
                    {fieldErrors.docType}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="state-code">State code</Label>
                <Input
                  id="state-code"
                  value={stateCode}
                  maxLength={4}
                  placeholder="CA"
                  aria-label="State or jurisdiction code"
                  className="h-11 uppercase"
                  onChange={(event) => setStateCode(event.target.value.toUpperCase())}
                />
                {fieldErrors.stateCode ? (
                  <p className="text-xs text-wax" role="alert">
                    {fieldErrors.stateCode}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="signer-address">Signer wallet address</Label>
                <Input
                  id="signer-address"
                  value={signerAddress}
                  placeholder="0x…"
                  aria-label="Signer wallet address"
                  className="hash-text h-11"
                  onChange={(event) => setSignerAddress(event.target.value.trim())}
                />
                {address ? (
                  <button
                    type="button"
                    onClick={() => setSignerAddress(address)}
                    className="self-start text-xs text-gold transition-colors hover:text-gold/80"
                  >
                    Use my connected wallet
                  </button>
                ) : null}
                {fieldErrors.signerAddress ? (
                  <p className="text-xs text-wax" role="alert">
                    {fieldErrors.signerAddress}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        ) : null}

        {step === 2 ? (
          <motion.div key="step-2" variants={stepVariants} initial="hidden" animate="show" exit="exit" className="mt-10">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/20 px-4 text-sm font-medium text-ink transition-colors hover:border-gold/60 hover:bg-white/5"
              aria-label="Back to the upload step"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to upload
            </button>
            <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">
              Sign the notarial act
            </h1>
            <p className="mt-2 text-mist">
              Approve the $1.00 USDC fee, then sign the two EIP-712 messages — first as the
              signer, then as the notary.
            </p>

            {signError ? (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-wax/40 bg-wax/10 p-4" role="alert">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-wax" aria-hidden="true" />
                <div>
                  <p className="font-medium text-wax">Signing problem</p>
                  <p className="mt-1 text-sm text-ink/80">{signError}</p>
                </div>
              </div>
            ) : null}

            {!isConnected ? (
              <div className="glass mt-6 flex flex-col items-center gap-4 p-8 text-center">
                <PenLine className="size-10 text-gold" aria-hidden="true" />
                <p className="text-mist">Connect a wallet to sign as both parties.</p>
                <WalletConnectButton />
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-4">
                {wrongChain ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4" role="alert">
                    <p className="text-sm text-amber-300">
                      Wrong network — OpenNotary runs on Base Sepolia.
                    </p>
                    <Button
                      onClick={() => switchChain({ chainId: BASE_SEPOLIA_CHAIN_ID })}
                      disabled={isSwitching}
                      className="rounded-xl bg-amber-400 text-xs font-semibold text-navy hover:bg-amber-300"
                    >
                      {isSwitching ? 'Switching…' : 'Switch to Base Sepolia'}
                    </Button>
                  </div>
                ) : null}

                {!signerMatches && address ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4" role="alert">
                    <p className="text-sm text-gold">
                      Demo mode: the signer must co-sign from their own wallet — use the
                      connected address.
                    </p>
                    <Button
                      onClick={() => setSignerAddress(address)}
                      className="rounded-xl bg-gold text-xs font-semibold text-navy hover:bg-gold/90"
                    >
                      Use connected wallet
                    </Button>
                  </div>
                ) : null}

                {/* USDC allowance step */}
                <div className="glass flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      USDC allowance — {formatUsdc(TOTAL_FEE)}
                    </p>
                    <p className="mt-0.5 text-xs text-mist">
                      {formatUsdc(NOTARY_FEE)} notary fee + {formatUsdc(PROTOCOL_FEE)} protocol
                      fee · spender: registry
                    </p>
                  </div>
                  {allowanceLoading ? (
                    <Skeleton className="h-9 w-28 rounded-xl" />
                  ) : allowanceOk ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Approved
                    </span>
                  ) : (
                    <Button
                      onClick={handleApprove}
                      disabled={approving || wrongChain}
                      className="h-9 rounded-xl bg-gold font-semibold text-navy hover:bg-gold/90"
                    >
                      {approving ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden="true" />
                          Approving…
                        </>
                      ) : (
                        <>Approve {formatUsdc(TOTAL_FEE)}</>
                      )}
                    </Button>
                  )}
                </div>

                {/* Signature inputs summary */}
                <div className="glass p-4">
                  <p className="text-sm font-medium text-ink">Signature inputs</p>
                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                    {[
                      { term: 'Document hash', value: signingInputs ? truncateMiddle(signingInputs.docHash, 10, 8) : 'computing…' },
                      { term: 'IPFS CID hash', value: signingInputs ? truncateMiddle(signingInputs.ipfsCid, 10, 8) : 'computing…' },
                      { term: 'Fee', value: signingInputs ? formatUsdc(signingInputs.fee) : '—' },
                      { term: 'Timestamp', value: signingInputs ? signingInputs.timestamp.toString() : '—' },
                      { term: 'Deadline', value: signingInputs ? signingInputs.deadline.toString() : '—' },
                      { term: 'Nonce', value: nonces ? `${nonces.notary} / ${nonces.signer}` : 'loading…' },
                    ].map((row) => (
                      <div key={row.term} className="flex justify-between gap-3">
                        <dt className="text-mist">{row.term}</dt>
                        <dd className="hash-text min-w-0 truncate text-ink">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </motion.div>
        ) : null}

        {step === 3 ? (
          <motion.div key="step-3" variants={stepVariants} initial="hidden" animate="show" exit="exit" className="mt-10">
            {result ? (
              <div className="flex flex-col items-center gap-6 text-center">
                <motion.div
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                >
                  <CheckCircle2 className="size-20 text-success" aria-hidden="true" />
                </motion.div>
                <h1 className="font-heading text-3xl font-bold text-ink">Notarization complete!</h1>
                <p className="max-w-md text-mist">
                  Your act is recorded on-chain, attested on EAS and queued for Bitcoin anchoring.
                </p>
                <HashChip value={result.docHash} label="Doc hash" lead={10} tail={8} />
                <div className="flex flex-col gap-3 sm:flex-row">
                  <a
                    href={basescanTxUrl(result.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      linkButtonClass,
                      'rounded-xl border border-white/20 text-ink hover:bg-white/5',
                    )}
                    aria-label="View the transaction on Basescan"
                  >
                    View on Basescan
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                  <Link
                    href={`/verify/${result.docHash}`}
                    className={cn(
                      linkButtonClass,
                      'rounded-xl bg-gold font-semibold text-navy hover:bg-gold/90 glow-gold',
                    )}
                    aria-label="Open the verify page for this document"
                  >
                    Open verify page
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">
                  Confirm &amp; notarize
                </h1>
                <p className="mt-2 text-mist">
                  Four steps run in sequence — each produces its own immutable receipt.
                </p>

                <ol className="mt-8 flex flex-col gap-3">
                  {BEATS.map((beat, index) => {
                    const done = pipeline.beat > index || (result !== null);
                    const active = pipelineRunning && pipeline.beat === index;
                    const failed = !!pipelineError && pipeline.beat === index;
                    const BeatIcon = beat.icon;
                    return (
                      <li
                        key={beat.label}
                        className={cn(
                          'glass flex items-center gap-3 p-4 transition-colors',
                          failed && 'border-wax/40 bg-wax/10',
                          active && 'border-gold/40',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-10 items-center justify-center rounded-full border',
                            done
                              ? 'border-success/50 bg-success/10 text-success'
                              : active
                                ? 'border-gold/50 bg-gold/10 text-gold'
                                : 'border-white/15 text-mist',
                          )}
                        >
                          {done ? (
                            <Check className="size-5" aria-hidden="true" />
                          ) : active ? (
                            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                          ) : (
                            <BeatIcon className="size-5" aria-hidden="true" />
                          )}
                        </span>
                        <div className="flex-1">
                          <p
                            className={cn(
                              'text-sm font-medium',
                              done ? 'text-ink' : active ? 'text-gold' : 'text-mist',
                            )}
                          >
                            {beat.label}
                          </p>
                          <p className="text-xs text-mist">
                            {index === 0 && 'Pinning the document to IPFS via Web3.Storage'}
                            {index === 1 && 'writeNotarize() with both EIP-712 signatures'}
                            {index === 2 && 'Non-revocable NotarialAct attestation (relayer)'}
                            {index === 3 && 'OpenTimestamps calendar submission'}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {pipelineError ? (
                  <div
                    className="mt-6 flex items-start gap-3 rounded-2xl border border-wax/40 bg-wax/10 p-4"
                    role="alert"
                  >
                    <AlertTriangle className="mt-0.5 size-5 shrink-0 text-wax" aria-hidden="true" />
                    <div>
                      <p className="font-medium text-wax">Pipeline interrupted</p>
                      <p className="mt-1 text-sm text-ink/80">{pipelineError}</p>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Sticky bottom CTA (64px) */}
      {!result ? (
        <div className="fixed inset-x-0 bottom-14 z-30 border-t border-white/10 bg-navy/90 backdrop-blur-xl lg:bottom-0">
          <div className="mx-auto flex h-16 max-w-2xl items-center px-4 sm:px-6">
            {step === 1 ? (
              <Button
                onClick={() => {
                  if (validateStep1()) setStep(2);
                }}
                disabled={uploadState !== 'done'}
                className="h-12 w-full rounded-xl bg-gold text-base font-semibold text-navy hover:bg-gold/90 glow-gold"
              >
                {uploadState === 'uploading' ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Uploading to IPFS…
                  </>
                ) : uploadState === 'error' ? (
                  'Upload failed — pick the file again'
                ) : (
                  'Continue to signing'
                )}
              </Button>
            ) : null}

            {step === 2 ? (
              <Button
                onClick={() => setSheetOpen(true)}
                disabled={
                  !isConnected ||
                  wrongChain ||
                  !allowanceOk ||
                  !signerMatches ||
                  !signingInputs ||
                  signing
                }
                className="h-12 w-full rounded-xl bg-gold text-base font-semibold text-navy hover:bg-gold/90 glow-gold"
              >
                Review typed data &amp; sign
              </Button>
            ) : null}

            {step === 3 ? (
              <Button
                onClick={() => void runPipeline()}
                disabled={pipelineRunning || (pipeline.beat > 0 && !pipelineError)}
                className="h-12 w-full rounded-xl bg-gold text-base font-semibold text-navy hover:bg-gold/90 glow-gold"
              >
                {pipelineRunning ? (
                  <>
                    <Loader2 className="animate-spin" aria-hidden="true" />
                    Notarizing…
                  </>
                ) : pipelineError ? (
                  'Retry from failed step'
                ) : pipeline.beat > 0 ? (
                  'Pipeline running…'
                ) : (
                  'Confirm & notarize'
                )}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Bottom-sheet typed-data summary (drag-to-dismiss on mobile) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="font-heading text-xl text-ink">
              Review the typed data
            </SheetTitle>
            <SheetDescription className="text-mist">
              You will sign two EIP-712 messages with your wallet — SignerAcknowledgment first,
              then NotaryAttestation.
            </SheetDescription>
          </SheetHeader>

          <div className="glass p-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">
              SignerAcknowledgment · NotaryAttestation
            </p>
            <dl className="mt-3 flex flex-col gap-2">
              {typedDataRows.map((row) => (
                <div key={row.label} className="flex justify-between gap-4 text-xs">
                  <dt className="hash-text text-mist">{row.label}</dt>
                  <dd className="hash-text min-w-0 truncate text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <SheetFooter className="flex-col gap-2 sm:flex-col">
            <Button
              onClick={() => void handleSign()}
              disabled={signing}
              className="h-12 w-full rounded-xl bg-gold text-base font-semibold text-navy hover:bg-gold/90"
            >
              {signing ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Check your wallet…
                </>
              ) : (
                'Sign both messages'
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setSheetOpen(false)}
              className="h-11 w-full rounded-xl text-mist hover:text-ink"
            >
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
