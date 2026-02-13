import {
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { tools, executeTool } from './tools';
import { sseEncode, sseDone, sseError } from './sse';

const SYSTEM_PROMPT =
  'You are a helpful assistant. You have access to a web_search tool. ' +
  'Use it only when you genuinely need real-time or up-to-date information ' +
  '(e.g. current news, live prices, today\'s weather, recent events after your knowledge cutoff). ' +
  'For general knowledge, explanations, coding help, or anything you can answer confidently from your training data, ' +
  'respond directly without searching.';

const MAX_TOOL_ITERATIONS = 5;

function extractText(content: unknown): string {
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

export function createAgent(model: BaseChatModel) {
  const modelWithTools = model.bindTools(tools);

  return {
    createStream(langchainMessages: BaseMessage[]): ReadableStream<Uint8Array> {
      return new ReadableStream({
        async start(controller) {
          try {
            const currentMessages: BaseMessage[] = [
              new SystemMessage(SYSTEM_PROMPT),
              ...langchainMessages,
            ];
            let toolsUsed = false;

            for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
              const response = await modelWithTools.invoke(currentMessages);
              if (response == null) break;

              const toolCalls = response.tool_calls;
              if (toolCalls == null || toolCalls.length === 0) {
                if (!toolsUsed) {
                  const text = extractText(response.content);
                  if (text) {
                    controller.enqueue(sseEncode({ content: text }));
                  }
                }
                break;
              }

              toolsUsed = true;
              currentMessages.push(response as BaseMessage);

              for (const tc of toolCalls) {
                const toolName = tc.name ?? 'unknown';
                const toolArgs = (tc.args as Record<string, unknown> | undefined) ?? {};
                const toolCallId = tc.id ?? `call_${i}`;

                controller.enqueue(
                  sseEncode({ type: 'tool_call', name: toolName, args: toolArgs }),
                );

                const result = await executeTool(toolName, toolArgs);

                controller.enqueue(
                  sseEncode({ type: 'tool_result', name: toolName }),
                );

                currentMessages.push(
                  new ToolMessage({ content: result, tool_call_id: toolCallId }) as BaseMessage,
                );
              }
            }

            if (toolsUsed) {
              const stream = await modelWithTools.stream(currentMessages);
              for await (const chunk of stream) {
                if (chunk == null) continue;
                const text = extractText(chunk.content);
                if (text) {
                  controller.enqueue(sseEncode({ content: text }));
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
