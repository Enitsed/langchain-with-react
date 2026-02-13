import { ChatBedrockConverse } from '@langchain/aws';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { createAgent } from './agent';

const model = new ChatBedrockConverse({
  model: 'anthropic.claude-3-haiku-20240307-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
  temperature: 0.7,
  maxTokens: 2048,
});

export const agent = createAgent(model);

export function toLangChainMessages(
  messages: { role: string; content: string }[],
): BaseMessage[] {
  return messages.map((msg) => {
    if (msg.role === 'user') return new HumanMessage(msg.content);
    if (msg.role === 'assistant') return new AIMessage(msg.content);
    return new SystemMessage(msg.content);
  });
}
