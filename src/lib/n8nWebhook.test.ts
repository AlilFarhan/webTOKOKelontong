import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N8N_PROD_WEBHOOK_URL,
  buildWebhookPayload,
  extractN8nReply,
  forwardToN8nWebhook,
  type FetchLike,
} from './n8nWebhook';

test('buildWebhookPayload constructs clean production payload without mode flags', () => {
  const payload = buildWebhookPayload({
    chatInput: '  Cek stok beras  ',
    sessionId: 'sess-123',
  });
  assert.deepEqual(payload, {
    chatInput: 'Cek stok beras',
    message: 'Cek stok beras',
    sessionId: 'sess-123',
    source: 'toko-kelontong-seulanga-web',
  });
});

test('extractN8nReply extracts output from strings, objects, nested json, and arrays', () => {
  assert.equal(extractN8nReply('Halo warga!'), 'Halo warga!');
  assert.equal(extractN8nReply({ output: 'Beras ready Rp 72.000' }), 'Beras ready Rp 72.000');
  assert.equal(
    extractN8nReply([{ json: { response: 'Gratis ongkir radius 2 km' } }]),
    'Gratis ongkir radius 2 km'
  );
  assert.equal(
    extractN8nReply({ data: { answer: 'Buka jam 07.00 - 22.00' } }),
    'Buka jam 07.00 - 22.00'
  );
  assert.equal(extractN8nReply({}), '');
});

test('forwardToN8nWebhook sends POST strictly to Production URL and parses reply', async () => {
  const calledUrls: string[] = [];
  let capturedMethod = '';
  const mockFetch: FetchLike = async (url, init) => {
    calledUrls.push(url);
    capturedMethod = init?.method ?? '';
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ output: 'Stok Beras Premium 5 Kg tersedia.' }),
    };
  };

  const result = await forwardToN8nWebhook(
    { chatInput: 'Cek beras', sessionId: 's1' },
    mockFetch
  );

  assert.equal(result.ok, true);
  assert.equal(capturedMethod, 'POST');
  assert.deepEqual(calledUrls, [N8N_PROD_WEBHOOK_URL]);
  assert.equal(result.reply, 'Stok Beras Premium 5 Kg tersedia.');
});

test('forwardToN8nWebhook returns user-friendly error when Production URL fails', async () => {
  const mockFetch: FetchLike = async () => ({
    ok: false,
    status: 404,
    text: async () =>
      JSON.stringify({ code: 404, message: 'The requested webhook is not registered.' }),
  });

  const result = await forwardToN8nWebhook(
    { chatInput: 'Halo', sessionId: 's3' },
    mockFetch
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.match(result.errorMessage ?? '', /0812-6900-1234/);
});
