import { agent, toLangChainMessages } from './model';
import index from './index.html';

const server = Bun.serve({
  routes: {
    '/*': index,
    '/api/chat': {
      async POST(req) {
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
  },
  development: process.env.NODE_ENV !== 'production' && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
