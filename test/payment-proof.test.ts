import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROOF_MAX_BYTES,
  buildProofPath,
  inlineProofUrl,
  isPdfProof,
  resolvePaymentProofUrl,
  validateProofFile,
} from '../src/lib/payment-proof.ts';

const EVENT = '3f2b6c1e-9d7a-4c2b-8f1e-0a1b2c3d4e5f';

test('validateProofFile accepts images/PDF up to 5 MB only', () => {
  assert.equal(validateProofFile({ size: 1000, type: 'image/png' }), null);
  assert.equal(validateProofFile({ size: 1000, type: 'application/pdf' }), null);
  assert.match(validateProofFile({ size: 1000, type: 'text/html' }) || '', /Format/);
  assert.match(validateProofFile({ size: PROOF_MAX_BYTES + 1, type: 'image/jpeg' }) || '', /5 MB/);
});

test('buildProofPath puts the file in the event folder the storage policy expects', () => {
  assert.equal(buildProofPath(EVENT, 'image/jpeg', 'abc-123'), `${EVENT}/abc-123.jpg`);
});

test('resolvePaymentProofUrl refuses participant-controlled dangerous values', async () => {
  assert.equal(await resolvePaymentProofUrl('javascript:alert(1)'), null);
  assert.equal(await resolvePaymentProofUrl('https://evil.example/phish.png'), null);
  assert.equal(await resolvePaymentProofUrl('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(await resolvePaymentProofUrl(''), null);

  const png = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(await resolvePaymentProofUrl(png), png);
  assert.equal(inlineProofUrl(png), png);
  assert.equal(inlineProofUrl('javascript:alert(1)'), null);
});

test('isPdfProof detects inline and stored PDFs', () => {
  assert.equal(isPdfProof('data:application/pdf;base64,JVBER'), true);
  assert.equal(isPdfProof(`${EVENT}/x.pdf`), true);
  assert.equal(isPdfProof(`${EVENT}/x.jpg`), false);
});
