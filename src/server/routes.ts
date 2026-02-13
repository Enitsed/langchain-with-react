import { agent } from './model';
import index from '../index.html';

export const routes = {
  '/*': index,
  '/api/chat': {
    async POST(req: Request) {
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
} as const;
