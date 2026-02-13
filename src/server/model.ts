import { ChatBedrockConverse } from '@langchain/aws';
import { MemorySaver } from '@langchain/langgraph';
import { createAgent } from './agent';

const model = new ChatBedrockConverse({
  model: 'anthropic.claude-3-haiku-20240307-v1:0',
  region: process.env.AWS_REGION || 'us-east-1',
  temperature: 0.7,
  maxTokens: 2048,
});

const checkpointer = new MemorySaver();

export const agent = createAgent(model, checkpointer);
