'use client';

/**
 * Notary onboarding form: react-hook-form + `notaryRegisterSchema` (zod),
 * submits to POST /api/notary/register and renders the success card with the
 * commission details plus a link to the dashboard.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { format, fromUnixTime } from 'date-fns';
import { BadgeCheck, Info, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';

import { notaryRegisterSchema, type NotaryRegisterInput } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { HashChip } from './hash-chip';
import { NotaryBadge } from './notary-badge';

/** Raw form fields (dates stay as ISO strings until the schema coerces them). */
type FormValues = {
  notary: string;
  commissionHash: string;
  stateCode: string;
  commissionExpiry: string;
};

/** Successful registration payload echoed back by the API. */
type RegistrationResult = {
  notary: string;
  commissionHash: string;
  stateCode: string;
  commissionExpiry: number;
};

export function NotaryRegisterForm() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);

  const form = useForm<FormValues>({
    // The schema preprocesses `commissionExpiry` (unknown → unix seconds); the
    // form layer keeps the raw date string, so the resolver is re-typed here.
    resolver: zodResolver(notaryRegisterSchema) as unknown as Resolver<FormValues>,
    defaultValues: {
      notary: '',
      commissionHash: '',
      stateCode: '',
      commissionExpiry: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const response = await fetch('/api/notary/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        notary?: string;
        commissionExpiry?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error === 'rate limited'
            ? 'Too many attempts — wait a minute and retry.'
            : 'Registration failed — check the fields and retry.',
        );
      }
      setResult({
        notary: payload.notary ?? values.notary,
        commissionHash: values.commissionHash,
        stateCode: values.stateCode,
        commissionExpiry: payload.commissionExpiry ?? 0,
      });
      toast.success('Commission recorded — pending on-chain registration');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="glass flex flex-col items-center gap-5 p-8 text-center">
        <BadgeCheck className="size-14 text-success" aria-hidden="true" />
        <h2 className="font-heading text-2xl font-bold text-ink">Commission recorded</h2>
        <NotaryBadge address={result.notary} status="pending" stateCode={result.stateCode} />
        <dl className="grid w-full max-w-md grid-cols-1 gap-3 text-left">
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-mist">Commission hash</dt>
            <dd>
              <HashChip value={result.commissionHash} lead={8} tail={6} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-mist">Jurisdiction</dt>
            <dd className="text-sm font-medium text-ink uppercase">{result.stateCode}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-mist">Expires</dt>
            <dd className="text-sm font-medium text-ink">
              {result.commissionExpiry > 0
                ? format(fromUnixTime(result.commissionExpiry), 'MMM d, yyyy')
                : '—'}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-mist">
          Production: the relayer registers on-chain after the BLI attestation. Hackathon mode:
          self-attested.
        </p>
        <Link
          href="/notary/dashboard"
          className={cn(
            buttonVariants({ variant: 'default' }),
            'h-12 rounded-xl bg-gold px-6 font-semibold text-navy hover:bg-gold/90',
          )}
        >
          Open the notary dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KYC info card */}
      <div className="flex items-start gap-3 rounded-2xl border border-gold/25 bg-gold/[0.07] p-5">
        <Info className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden="true" />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-gold">Identity attestation (KYC)</p>
          <p className="text-sm leading-relaxed text-ink/85">
            Production: BLI-issued EAS attestation. Hackathon mode: self-attested with visible
            note — the commission is recorded as pending until the relayer registers it on-chain.
          </p>
          <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-gold uppercase">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Hackathon mode: self-attested
          </span>
        </div>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="glass flex flex-col gap-5 p-6"
          noValidate
        >
          <FormField
            control={form.control}
            name="notary"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notary wallet address</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="0x…"
                    aria-label="Notary wallet address"
                    className="hash-text h-11"
                  />
                </FormControl>
                <FormDescription className="text-mist">
                  The wallet that will perform notarial acts.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="commissionHash"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Commission hash</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="0x… (bytes32)"
                    aria-label="Commission credential hash"
                    className="hash-text h-11"
                  />
                </FormControl>
                <FormDescription className="text-mist">
                  bytes32 hash referencing your commissioning credentials.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="stateCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State code</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="CA"
                      maxLength={4}
                      aria-label="State or jurisdiction code"
                      className="h-11 uppercase"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commissionExpiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commission expiry</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" aria-label="Commission expiry date" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="h-12 rounded-xl bg-gold text-base font-semibold text-navy hover:bg-gold/90 glow-gold"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              'Register commission'
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
