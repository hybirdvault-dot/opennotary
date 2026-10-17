import { describe, expect, test } from 'vitest';

/**
 * Acceptance tests for src/lib/schemas.ts (spec section 9).
 *
 * zod v3 safeParse against the pinned field rules: 0x addresses, bytes32 hex,
 * 2-4 char state codes, ISO-or-unix-seconds expiry coerced to number, a
 * non-empty file of at most 25MB, and bytes32/UID hex for verification input.
 */

const VALID_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const VALID_COMMISSION_HASH = '0x' + 'ab'.repeat(32);
const VALID_UID = '0x' + 'cd'.repeat(32);
const ISO_EXPIRY = '2030-01-01T00:00:00Z';
const ISO_EXPIRY_UNIX_SECONDS = 1_893_456_000;
const UNIX_SECONDS_EXPIRY = 1_893_500_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function makeFile(sizeBytes: number, name = 'document.pdf'): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'application/pdf' });
}

function issuePaths(result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }): (string | number)[] {
  return (result.error?.issues ?? []).map((issue) => issue.path[0]);
}

function validRegisterPayload(): Record<string, unknown> {
  return {
    notary: VALID_ADDRESS,
    commissionHash: VALID_COMMISSION_HASH,
    stateCode: 'CA',
    commissionExpiry: UNIX_SECONDS_EXPIRY,
  };
}

function validNotarizePayload(): Record<string, unknown> {
  return {
    file: makeFile(1024),
    docType: 'affidavit',
    stateCode: 'CA',
    signerAddress: VALID_ADDRESS,
  };
}

describe('src/lib/schemas', () => {
  describe('notaryRegisterSchema', () => {
    test('test_notaryRegisterSchema_parsesValidPayloadWithUnixSecondsExpiry', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      const result = notaryRegisterSchema.safeParse(validRegisterPayload());

      expect(result.success).toBe(true);
      if (result.success) {
        const output: import('@/lib/schemas').NotaryRegisterInput = result.data;
        expect(output.notary).toBe(VALID_ADDRESS);
        expect(output.commissionHash).toBe(VALID_COMMISSION_HASH);
        expect(output.stateCode).toBe('CA');
        expect(output.commissionExpiry).toBe(UNIX_SECONDS_EXPIRY);
        expect(typeof output.commissionExpiry).toBe('number');
      }
    });

    test('test_notaryRegisterSchema_convertsIsoDateExpiryToUnixSeconds', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      const result = notaryRegisterSchema.safeParse({
        ...validRegisterPayload(),
        commissionExpiry: ISO_EXPIRY,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.commissionExpiry).toBe(ISO_EXPIRY_UNIX_SECONDS);
      }
    });

    test('test_notaryRegisterSchema_acceptsUnixSecondsExpiryGivenAsString', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      const result = notaryRegisterSchema.safeParse({
        ...validRegisterPayload(),
        commissionExpiry: String(UNIX_SECONDS_EXPIRY),
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.commissionExpiry).toBe(UNIX_SECONDS_EXPIRY);
      }
    });

    test('test_notaryRegisterSchema_rejectsMalformedNotaryAddress', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      for (const notary of ['', 'not-an-address', '0x1234', VALID_ADDRESS.slice(0, -1)]) {
        const result = notaryRegisterSchema.safeParse({ ...validRegisterPayload(), notary });
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('notary');
      }
    });

    test('test_notaryRegisterSchema_rejectsMalformedCommissionHash', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      for (const commissionHash of ['', '0x1234', VALID_COMMISSION_HASH.slice(0, -1), 'ab'.repeat(32)]) {
        const result = notaryRegisterSchema.safeParse({
          ...validRegisterPayload(),
          commissionHash,
        });
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('commissionHash');
      }
    });

    test('test_notaryRegisterSchema_rejectsStateCodeOutsideTwoToFourChars', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      for (const stateCode of ['', 'C', 'CALIF']) {
        const result = notaryRegisterSchema.safeParse({ ...validRegisterPayload(), stateCode });
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('stateCode');
      }

      for (const stateCode of ['CA', 'NY', 'CALI']) {
        const result = notaryRegisterSchema.safeParse({ ...validRegisterPayload(), stateCode });
        expect(result.success).toBe(true);
      }
    });

    test('test_notaryRegisterSchema_rejectsNonDateCommissionExpiry', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      const result = notaryRegisterSchema.safeParse({
        ...validRegisterPayload(),
        commissionExpiry: 'not-a-date',
      });

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain('commissionExpiry');
    });

    test('test_notaryRegisterSchema_rejectsEmptyPayload', async () => {
      const { notaryRegisterSchema } = await import('@/lib/schemas');

      const result = notaryRegisterSchema.safeParse({});

      expect(result.success).toBe(false);
      const paths = issuePaths(result);
      expect(paths).toContain('notary');
      expect(paths).toContain('commissionHash');
      expect(paths).toContain('stateCode');
      expect(paths).toContain('commissionExpiry');
    });
  });

  describe('notarizeSchema', () => {
    test('test_notarizeSchema_parsesValidPayload', async () => {
      const { notarizeSchema } = await import('@/lib/schemas');
      const payload = validNotarizePayload();

      const result = notarizeSchema.safeParse(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        const output: import('@/lib/schemas').NotarizeInput = result.data;
        expect(output.file).toBe(payload.file);
        expect(output.docType).toBe('affidavit');
        expect(output.stateCode).toBe('CA');
        expect(output.signerAddress).toBe(VALID_ADDRESS);
      }
    });

    test('test_notarizeSchema_rejectsEmptyFile', async () => {
      const { notarizeSchema } = await import('@/lib/schemas');

      const result = notarizeSchema.safeParse({ ...validNotarizePayload(), file: makeFile(0) });

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain('file');
    });

    test('test_notarizeSchema_acceptsFileAtExactly25MB', async () => {
      const { notarizeSchema } = await import('@/lib/schemas');

      const result = notarizeSchema.safeParse({
        ...validNotarizePayload(),
        file: makeFile(MAX_FILE_BYTES, 'big.pdf'),
      });

      expect(result.success).toBe(true);
    });

    test('test_notarizeSchema_rejectsFileLargerThan25MB', async () => {
      const { notarizeSchema } = await import('@/lib/schemas');

      const result = notarizeSchema.safeParse({
        ...validNotarizePayload(),
        file: makeFile(MAX_FILE_BYTES + 1, 'big.pdf'),
      });

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain('file');
    });

    test('test_notarizeSchema_rejectsEmptyDocType', async () => {
      const { notarizeSchema } = await import('@/lib/schemas');

      const result = notarizeSchema.safeParse({ ...validNotarizePayload(), docType: '' });

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain('docType');
    });

    test('test_notarizeSchema_rejectsInvalidStateCodeAndSignerAddress', async () => {
      const { notarizeSchema } = await import('@/lib/schemas');

      const result = notarizeSchema.safeParse({
        ...validNotarizePayload(),
        stateCode: 'TOOLONG',
        signerAddress: '0xzz',
      });

      expect(result.success).toBe(false);
      const paths = issuePaths(result);
      expect(paths).toContain('stateCode');
      expect(paths).toContain('signerAddress');
    });

    test('test_notarizeSchema_rejectsMissingFile', async () => {
      const { notarizeSchema } = await import('@/lib/schemas');
      const { file: _file, ...withoutFile } = validNotarizePayload();

      const result = notarizeSchema.safeParse(withoutFile);

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain('file');
    });
  });

  describe('verifySchema', () => {
    test('test_verifySchema_acceptsBytes32DocHash', async () => {
      const { verifySchema } = await import('@/lib/schemas');

      const result = verifySchema.safeParse({ docHashOrUid: VALID_COMMISSION_HASH });

      expect(result.success).toBe(true);
      if (result.success) {
        const output: import('@/lib/schemas').VerifyInput = result.data;
        expect(output.docHashOrUid).toBe(VALID_COMMISSION_HASH);
      }
    });

    test('test_verifySchema_acceptsAttestationUidHex', async () => {
      const { verifySchema } = await import('@/lib/schemas');

      const result = verifySchema.safeParse({ docHashOrUid: VALID_UID });

      expect(result.success).toBe(true);
    });

    test('test_verifySchema_rejectsEmptyString', async () => {
      const { verifySchema } = await import('@/lib/schemas');

      const result = verifySchema.safeParse({ docHashOrUid: '' });

      expect(result.success).toBe(false);
      expect(issuePaths(result)).toContain('docHashOrUid');
    });

    test('test_verifySchema_rejectsNonHexAndWrongLengthInputs', async () => {
      const { verifySchema } = await import('@/lib/schemas');

      for (const docHashOrUid of [
        'hello world',
        '0x1234',
        VALID_UID.slice(0, -1),
        `0x${'g'.repeat(64)}`,
      ]) {
        const result = verifySchema.safeParse({ docHashOrUid });
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain('docHashOrUid');
      }
    });
  });
});
