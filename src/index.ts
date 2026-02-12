import { ChatBedrockConverse } from '@langchain/aws';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createAgent } from './agent';
import index from './index.html';

const model = new ChatBedrockConverse({
  model: 'anthropic.claude-3-haiku-20240307-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
  temperature: 0.7,
  maxTokens: 2048,
});

const agent = createAgent(model);

function toLangChainMessages(messages: { role: string; content: string }[]) {
  return messages.map((msg) => {
    if (msg.role === 'user') return new HumanMessage(msg.content);
    if (msg.role === 'assistant') return new AIMessage(msg.content);
    return new SystemMessage(msg.content);
  });
}

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
