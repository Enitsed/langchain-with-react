import { agent } from './model';
import { isRateLimited } from './rate-limit';
import index from '../index.html';

export const routes = {
  '/*': index,
  '/api/chat': {
    async POST(req: Request) {
      // Rate limit check
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
      if (isRateLimited(ip)) {
        return new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
        });
      }

      const { message, threadId } = (await req.json()) as {
        message?: string;
        threadId?: string;
      };

      if (!message || !threadId) {
        return new Response(JSON.stringify({ error: 'message and threadId are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(agent.createStream(message, threadId), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    },
  },
  '/api/chat/sessions/:threadId': {
    async GET(req: Request) {
      const { threadId } = (req as Request & { params: { threadId: string } }).params;
      const messages = await agent.getMessages(threadId);

      if (!messages) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(messages), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  },
} as const;
