const N8N_PROD_WEBHOOK_URL =
  'https://otomasi-n8n.skup2t.easypanel.host/webhook/b253c773-5d79-4792-b7ed-59978120f20b';

interface VercelLikeRequest {
  method?: string;
  body?: unknown;
}

interface VercelLikeResponse {
  status: (code: number) => VercelLikeResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (chunk?: string) => void;
}

interface N8nRequestPayload {
  chatInput?: string;
  message?: string;
  sessionId?: string;
  source?: string;
}

function extractN8nReply(payload: unknown): string {
  if (payload === null || payload === undefined) return '';
  if (typeof payload === 'string') return payload.trim();
  if (Array.isArray(payload)) {
    return payload.length > 0 ? extractN8nReply(payload[0]) : '';
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const keys = ['output', 'reply', 'response', 'text', 'message', 'answer', 'content'];
    for (const key of keys) {
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

function parseBodySafe(rawText: string): unknown {
  if (!rawText) return '';
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({
      ok: false,
      status: 405,
      errorMessage: 'Method tidak diizinkan. Gunakan POST.',
    });
    return;
  }

  try {
    let input: N8nRequestPayload = {};
    if (typeof req.body === 'string') {
      try {
        input = JSON.parse(req.body) as N8nRequestPayload;
      } catch {
        input = {};
      }
    } else if (req.body && typeof req.body === 'object') {
      input = req.body as N8nRequestPayload;
    }

    const text = (input.chatInput ?? input.message ?? '').toString().trim();
    if (!text) {
      res.status(400).json({
        ok: false,
        status: 400,
        reply: '',
        errorMessage: 'Pesan tidak boleh kosong.',
      });
      return;
    }

    const sessionId =
      typeof input.sessionId === 'string' && input.sessionId.trim()
        ? input.sessionId.trim()
        : `seulanga-${Date.now()}`;
    const source =
      typeof input.source === 'string' && input.source.trim()
        ? input.source.trim()
        : 'toko-kelontong-seulanga-web';

    const response = await fetch(N8N_PROD_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify({
        chatInput: text,
        message: text,
        sessionId,
        source,
      }),
      signal:
        typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
          ? AbortSignal.timeout(45000)
          : undefined,
    });

    const rawText = await response.text();
    const parsed = parseBodySafe(rawText);

    if (response.ok) {
      const reply =
        extractN8nReply(parsed) ||
        'Pesan Anda sudah diterima oleh Asisten Toko Seulanga.';
      res.status(200).json({
        ok: true,
        status: response.status,
        reply,
        raw: parsed,
      });
      return;
    }

    res.status(response.status).json({
      ok: false,
      status: response.status,
      reply: '',
      raw: parsed,
      errorMessage: `Gagal memproses permintaan asisten (HTTP ${response.status}). Silakan coba lagi atau hubungi WhatsApp 0812-6900-1234.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Koneksi gagal';
    res.status(502).json({
      ok: false,
      status: 502,
      reply: '',
      raw: { message },
      errorMessage:
        'Gagal terhubung ke Asisten Toko. Silakan coba lagi atau hubungi WhatsApp 0812-6900-1234.',
    });
  }
}
