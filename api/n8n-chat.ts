import { forwardToN8nWebhook, type N8nChatRequestBody } from '../src/lib/n8nWebhook';

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

export default async function handler(
  req: VercelLikeRequest,
  res: VercelLikeResponse
) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

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

  let parsedBody: N8nChatRequestBody = {};
  if (typeof req.body === 'string') {
    try {
      parsedBody = JSON.parse(req.body) as N8nChatRequestBody;
    } catch {
      parsedBody = {};
    }
  } else if (req.body && typeof req.body === 'object') {
    parsedBody = req.body as N8nChatRequestBody;
  }

  const result = await forwardToN8nWebhook(parsedBody);
  res.status(result.ok ? 200 : result.status).json(result);
}
