import type { Metadata } from 'next';
import { Scale } from 'lucide-react';

import { SectionHeading } from '@/components/section-heading';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Legal memo — OpenNotary',
  description:
    'How OpenNotary’s on-chain notarial acts map to UETA §7, ESIGN §101(c), e-IDAS QES, MiCA Art. 60, SEC Rule 17a-4(f)(2), GDPR Art. 5(1)(f) and UCC Article 12 §12-105.',
};

type LegalSection = {
  id: string;
  citation: string;
  title: string;
  body: string[];
  mappings: string[];
};

const SECTIONS: LegalSection[] = [
  {
    id: 'ueta',
    citation: 'UETA § 7',
    title: 'Legal recognition of electronic records and signatures',
    body: [
      'The Uniform Electronic Transactions Act (adopted in nearly every US state) provides that a record or signature may not be denied legal effect or validity solely because it is in electronic form, and that a contract may not be denied effect solely because an electronic record was used in its formation.',
      'UETA applies where the parties agreed to conduct the transaction electronically. Its core requirement is attribution and intent: an electronic signature is attributable to a person if it was the act of that person, which may be shown in any manner — including by demonstrating the security procedure applied to the record.',
    ],
    mappings: [
      'Every notarial act is signed twice on EIP-712 typed data — once by the signer (SignerAcknowledgment) and once by the commissioned notary (NotaryAttestation) — so intent and attribution are cryptographically demonstrable.',
      'The keccak256 document hash recorded on the NotaryRegistry contract is the electronic record: unique, timestamped and attributable to both wallet addresses.',
      'The EAS attestation and OpenTimestamps Bitcoin anchor provide independent, third-party-verifiable evidence of the record’s existence at a point in time.',
    ],
  },
  {
    id: 'esign',
    citation: 'ESIGN Act § 101(c)',
    title: 'Consumer consent to electronic records',
    body: [
      'The federal ESIGN Act (15 U.S.C. § 7001) confirms the validity of electronic signatures and records in interstate commerce. Section 101(c) conditions the delivery of legally required written disclosures electronically on the consumer’s informed consent: the consumer must be told their right to receive paper, the scope of consent, how to withdraw it and how to request copies.',
      'ESIGN also preserves any existing requirements of state notarial law — an electronic signature satisfies a requirement of notarization when the signature is executed by a notary public together with all other required notarial information.',
    ],
    mappings: [
      'The signer’s consent is captured as explicit typed data: the SignerAcknowledgment message commits the signer’s wallet to the document hash, the notary’s address and a timestamp before any record is created.',
      'Each act carries a permanent audit trail — signature pair, tx hash, attestation UID and Bitcoin anchor — so complete copies can be produced on demand from the verify page.',
      'The notarize wizard requires an affirmative step (a bottom-sheet summary of the typed data) before any signature is requested, evidencing informed consent.',
    ],
  },
  {
    id: 'eidas',
    citation: 'e-IDAS (EU) 2014/910 · QES',
    title: 'Qualified electronic signatures in the European Union',
    body: [
      'Under the e-IDAS Regulation, a qualified electronic signature (QES) created by a qualified signature creation device and based on a qualified certificate has the equivalent legal effect of a handwritten signature across all member states, and cannot be denied admissibility solely for being electronic.',
      'A QES rests on a chain of trust: a qualified trust service provider vouches for the identity of the signatory. The regulation also recognises electronic timestamps and seals as supporting evidence of a record’s integrity and origin.',
    ],
    mappings: [
      'OpenNotary separates identity from the act: commissioning trust (KYC/BLI attestation of the notary) is anchored as an EAS NotaryCommission attestation, while each act is non-revocably attested under the NotarialAct schema.',
      'In production, BLI (or an EU QTSP) issues the identity attestation; the hackathon build self-attests commissions with a visible note so the trust seam is explicit and auditable.',
      'Signature integrity is absolute: the EIP-712 digest binds document hash, counterparties and timestamp; any alteration invalidates the recovered signer address.',
    ],
  },
  {
    id: 'mica',
    citation: 'Regulation (EU) 2023/1114 Art. 60',
    title: 'MiCA — e-money tokens and on-chain settlement',
    body: [
      'The Markets in Crypto-Assets Regulation (MiCA) governs crypto-asset issuance and services in the EU. Its e-money token (EMT) regime — which includes provisions such as Article 60 — governs tokens like USDC: they may only be issued by authorised credit or electronic money institutions, must be redeemable at par value at any time and must be backed by segregated reserve assets.',
      'For a platform settling fees on-chain, the compliance question is which token is used, who issues it, and whether redemption and reserve disclosure obligations are met by that issuer.',
    ],
    mappings: [
      'OpenNotary settles exclusively in USDC — a regulated, fully reserved e-money token issued by an authorised issuer — so the settlement leg sits inside the MiCA EMT regime rather than in unbacked tokens.',
      'Fees are denominated in dollars ($1.00 per act: $0.99 notary + $0.01 protocol) and transferred at the token’s fixed 6-decimal unit, so value is always par-denominated.',
      'The platform never takes custody of user funds: settlement is a direct ERC-20 transferFrom executed by the registry contract during the notarial act.',
    ],
  },
  {
    id: 'sec-17a4',
    citation: '17 CFR § 240.17a-4(f)(2)',
    title: 'SEC electronic recordkeeping — immutable audit trails',
    body: [
      'Broker-dealers must preserve required records in non-rewriteable, non-erasable (WORM) format, or — under the audit-trail alternative of Rule 17a-4(f)(2)(ii)(A) — maintain records that preserve an unalterable audit trail of any original, alteration or deletion, with indexed, time-sequenced copies.',
      'The practical standard for electronic storage media is immutability plus retrievability: records must be preserved for the required retention period and must be readily accessible for examination.',
    ],
    mappings: [
      'The NotaryRegistry contract record is append-only: acts are hashed on-chain and marked revoked only by explicit admin action — never edited or erased — yielding the WORM property natively.',
      'OpenTimestamps anchoring adds an external, Bitcoin-grade non-rewriteable layer: the act’s composite digest is committed into the Bitcoin blockchain, where it cannot be altered retroactively.',
      'The verify page reconstructs the complete, time-sequenced record (hash → chain anchor → attestation → witness) on demand from any device.',
    ],
  },
  {
    id: 'gdpr',
    citation: 'GDPR Art. 5(1)(f)',
    title: 'Integrity and confidentiality of personal data',
    body: [
      'The GDPR’s integrity and confidentiality principle requires that personal data be processed in a manner that ensures appropriate security, including protection against unauthorised or unlawful processing and against accidental loss, destruction or damage, using appropriate technical or organisational measures.',
      'Data minimisation (Art. 5(1)(c)) is the natural complement: blockchains are public and permanent, so personal data should never be written on-chain when a cryptographic commitment suffices.',
    ],
    mappings: [
      'Only hashes go on-chain. The document content lives off-chain in IPFS and is referenced by a keccak256 commitment — no personal data is published to the ledger.',
      'Wallet addresses are pseudonymous identifiers; the mapping to real identity stays with the commissioning authority (BLI/KYC provider), not the public record.',
      'Act records can be redacted off-chain (the IPFS pin can be revoked) while the on-chain commitment remains a valid integrity proof of the original.',
    ],
  },
  {
    id: 'ucc-12',
    citation: 'UCC Article 12 § 12-105',
    title: 'Control of controllable electronic records',
    body: [
      'Article 12 of the Uniform Commercial Code (adopted progressively across states) governs controllable electronic records (CERs) — digital assets whose ownership is determined by control rather than by possession or a writing. A person has control of a CER when the record is unique, substantially all of its benefits flow to him, and he can identify himself as having control.',
      'Control-based ownership is the legal foundation for treating on-chain records as the authoritative version of a document’s provenance — a digital original.',
    ],
    mappings: [
      'Each notarial act is a unique controllable record keyed by its bytes32 document hash — no two acts can claim the same identity (the registry rejects duplicates).',
      'The dual EIP-712 signature scheme means the benefits of the record flow to the identifiable controlling parties (signer and notary), whose wallets are provably bound to the record.',
      'Transfers of provenance are verifiable without intermediaries: anyone can verify the signature pair, the EAS attestation and the Bitcoin anchor directly from the verify page.',
    ],
  },
];

/**
 * Regulatory memo: long-form typography with a sticky sidebar TOC on large
 * screens and a "How OpenNotary satisfies this" feature-mapping callout at the
 * end of every section.
 */
export default function LegalPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <SectionHeading
        eyebrow="Regulatory memo"
        title="How on-chain notarization maps to the law"
        subtitle="Electronic signature and records law already contemplates exactly what OpenNotary builds: attributed signatures, immutable records and reproducible audit trails. Here is the section-by-section mapping."
        as="h1"
      />

      <div className="mt-14 grid grid-cols-1 gap-12 lg:grid-cols-[220px_1fr]">
        {/* Sticky sidebar TOC (lg+) */}
        <nav aria-label="Table of contents" className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-3">
            <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">Contents</p>
            <ul className="flex flex-col gap-2.5 border-l border-white/10 pl-4">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="block text-sm leading-snug text-mist transition-colors hover:text-gold"
                  >
                    <span className="hash-text text-xs text-gold/80">{section.citation}</span>
                    <br />
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Long-form body */}
        <article className="flex max-w-3xl flex-col gap-12">
          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <p className="hash-text text-sm text-gold">{section.citation}</p>
              <h2 className="font-heading mt-2 text-2xl font-bold text-ink sm:text-3xl">
                {section.title}
              </h2>

              <div className="mt-5 flex flex-col gap-4 text-[17px] leading-[1.7] text-ink/90">
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                ))}
              </div>

              <div
                className={cn(
                  'mt-6 rounded-2xl border border-gold/25 bg-gold/[0.07] p-5',
                )}
              >
                <p className="flex items-center gap-2 text-sm font-semibold tracking-wide text-gold uppercase">
                  <Scale className="size-4" aria-hidden="true" />
                  How OpenNotary satisfies this
                </p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {section.mappings.map((mapping) => (
                    <li key={mapping.slice(0, 48)} className="flex gap-2.5 text-[15px] leading-relaxed text-ink/90">
                      <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" />
                      {mapping}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}

          <footer className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-sm leading-relaxed text-mist">
              <strong className="text-ink">Disclaimer:</strong> this memo is provided for
              information only and does not constitute legal advice. It summarises publicly
              available regulatory texts as applied to a technology demonstration; acceptance of
              electronic notarial acts varies by jurisdiction. Consult a licensed attorney before
              relying on electronic notarization for any legal purpose.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
