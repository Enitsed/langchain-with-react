import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  HumanMessage,
  isAIMessage,
  isAIMessageChunk,
  isToolMessage,
  type BaseMessage,
  type BaseMessageChunk,
} from '@langchain/core/messages';
import type { ChatBedrockConverse } from '@langchain/aws';
import type { MemorySaver } from '@langchain/langgraph';
import { tools } from './tools';
import { sseEncode, sseDone, sseError } from './sse';

const SYSTEM_PROMPT =
  'You are a helpful assistant. You have access to a web_search tool. ' +
  'Use it only when you genuinely need real-time or up-to-date information ' +
  '(e.g. current news, live prices, today\'s weather, recent events after your knowledge cutoff). ' +
  'For general knowledge, explanations, coding help, or anything you can answer confidently from your training data, ' +
  'respond directly without searching.';

const RECURSION_LIMIT = 10;

function extractContent(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: 'text'; text: string } =>
          block != null && typeof block === 'object' && block.type === 'text',
      )
      .map((block) => block.text ?? '')
      .join('');
  }
  return '';
}

export function createAgent(model: ChatBedrockConverse, checkpointer: MemorySaver) {
  const agent = createReactAgent({
    llm: model,
    tools,
    prompt: SYSTEM_PROMPT,
    checkpointer,
  });

  return {
    createStream(message: string, threadId: string): ReadableStream<Uint8Array> {
      return new ReadableStream({
        async start(controller) {
          try {
            const stream = await agent.stream(
              { messages: [new HumanMessage(message)] },
              { streamMode: ['updates', 'messages'], recursionLimit: RECURSION_LIMIT, configurable: { thread_id: threadId } },
            );

            for await (const chunk of stream) {
              const [mode, data] = chunk as [string, unknown];

              if (mode === 'updates') {
                const update = data as Record<string, { messages?: unknown[] }>;
                for (const [nodeName, nodeOutput] of Object.entries(update)) {
                  const messages = nodeOutput?.messages;
                  if (!Array.isArray(messages)) continue;

                  for (const msg of messages as BaseMessage[]) {
                    if (nodeName === 'agent' && isAIMessage(msg)) {
                      const toolCalls = msg.tool_calls;
                      if (toolCalls && toolCalls.length > 0) {
                        for (const tc of toolCalls) {
                          controller.enqueue(
                            sseEncode({
                              type: 'tool_call',
                              name: tc.name ?? 'unknown',
                              args: (tc.args as Record<string, unknown>) ?? {},
                            }),
                          );
                        }
                      }
                    } else if (nodeName === 'tools' && isToolMessage(msg)) {
                      controller.enqueue(
                        sseEncode({
                          type: 'tool_result',
                          name: msg.name ?? 'unknown',
                        }),
                      );
                    }
                  }
                }
              } else if (mode === 'messages') {
                const [message] = data as [BaseMessageChunk, unknown];
                if (isAIMessageChunk(message)) {
                  const text = extractContent(message.content);
                  if (text) {
                    controller.enqueue(sseEncode({ content: text }));
                  }
                }
              }
            }

            controller.enqueue(sseDone());
            controller.close();
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            controller.enqueue(sseError(errMsg));
            controller.close();
          }
        },
      });
    },
  };
}
