import { agent, toLangChainMessages } from './model';
import index from '../index.html';

export const routes = {
  '/*': index,
  '/api/chat': {
    async POST(req: Request) {
      const { messages } = (await req.json()) as {
        messages: { role: string; content: string }[];
      };

      return new Response(agent.createStream(toLangChainMessages(messages)), {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    },
  },
} as const;
