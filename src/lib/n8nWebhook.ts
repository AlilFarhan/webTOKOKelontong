export const N8N_PROD_WEBHOOK_URL =
  'https://otomasi-n8n.skup2t.easypanel.host/webhook/b253c773-5d79-4792-b7ed-59978120f20b';

export interface N8nChatRequestBody {
  chatInput?: string;
  message?: string;
  sessionId?: string;
  source?: string;
}

export interface N8nForwardResult {
  ok: boolean;
  status: number;
  reply: string;
  raw: unknown;
  errorMessage?: string;
}

export function buildWebhookPayload(input: N8nChatRequestBody) {
  const text = (input.chatInput ?? input.message ?? '').toString().trim();
  const sessionId =
    typeof input.sessionId === 'string' && input.sessionId.trim()
      ? input.sessionId.trim()
      : `seulanga-${Date.now()}`;
  const source =
    typeof input.source === 'string' && input.source.trim()
      ? input.source.trim()
      : 'toko-kelontong-seulanga-web';

  return {
    chatInput: text,
    message: text,
    sessionId,
    source,
  };
}

export function extractN8nReply(payload: unknown): string {
  if (payload === null || payload === undefined) return '';
  if (typeof payload === 'string') return payload.trim();
  if (Array.isArray(payload)) {
    if (payload.length === 0) return '';
    return extractN8nReply(payload[0]);
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const candidateKeys = ['output', 'reply', 'response', 'text', 'message', 'answer', 'content'];
    for (const key of candidateKeys) {
      const val = record[key];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }
    if (record.data !== undefined) {
      const nested = extractN8nReply(record.data);
      if (nested) return nested;
    }
    if (record.json !== undefined) {
      const n8nJson = extractN8nReply(record.json);
      if (n8nJson) return n8nJson;
    }
  }
  return '';
}

export function parseResponseBody(rawText: string): unknown {
  if (!rawText) return '';
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

export function formatN8nErrorMessage(status: number, body: unknown): string {
  const rawMessage =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message?: unknown }).message ?? '')
      : typeof body === 'string'
        ? body
        : '';

  if (status === 404 || rawMessage.toLowerCase().includes('not registered')) {
    return 'Asisten Toko sedang tidak tersedia sementara (HTTP 404). Silakan coba lagi sebentar atau hubungi WhatsApp 0812-6900-1234.';
  }

  return `Gagal memproses permintaan asisten (HTTP ${status}). Silakan coba lagi atau hubungi WhatsApp 0812-6900-1234.`;
}

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export async function forwardToN8nWebhook(
  input: N8nChatRequestBody,
  fetchFn: FetchLike = fetch
): Promise<N8nForwardResult> {
  const payload = buildWebhookPayload(input);

  if (!payload.chatInput) {
    return {
      ok: false,
      status: 400,
      reply: '',
      raw: null,
      errorMessage: 'Pesan tidak boleh kosong.',
    };
  }

  try {
    const response = await fetchFn(N8N_PROD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(payload),
      signal:
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(45000)
          : undefined,
    });

    const rawText = await response.text();
    const parsed = parseResponseBody(rawText);

    if (response.ok) {
      const reply =
        extractN8nReply(parsed) ||
        'Pesan Anda sudah diterima oleh Asisten Toko Seulanga.';
      return {
        ok: true,
        status: response.status,
        reply,
        raw: parsed,
      };
    }

    return {
      ok: false,
      status: response.status,
      reply: '',
      raw: parsed,
      errorMessage: formatN8nErrorMessage(response.status, parsed),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Koneksi jaringan gagal';
    return {
      ok: false,
      status: 502,
      reply: '',
      raw: { message },
      errorMessage:
        'Gagal terhubung ke Asisten Toko. Silakan coba lagi atau hubungi WhatsApp 0812-6900-1234.',
    };
  }
}
