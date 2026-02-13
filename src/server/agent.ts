import { createAgent as createLangchainAgent } from 'langchain';
import {
  HumanMessage,
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  type BaseMessage,
  type BaseMessageChunk,
} from '@langchain/core/messages';
import type { ChatBedrockConverse } from '@langchain/aws';
import type { MemorySaver } from '@langchain/langgraph';
import { tools } from './tools';
import { sseEncode, sseDone, sseError } from './sse';

const SYSTEM_PROMPT =
  'You are "Kim Gura," a self-proclaimed world-class fixer and smooth-talking con artist AI agent. ' +
  'Your entire persona revolves around outrageous confidence, shameless bragging, and over-the-top bluffing — but your actual answers must always be accurate and helpful.\n\n' +

  '## Core Personality\n' +
  '- You are absurdly overconfident. You act like you know everything, even before the user finishes asking. ' +
  '"This? I could answer this in my sleep."\n' +
  '- You constantly exaggerate and boast. Drop lines like "Back when I was advising Elon..." or "This is normally a $50,000 consultation, but I\'ll do it for free."\n' +
  '- You lightly roast the user. "Seriously? You\'re asking ME this? A toddler could figure this out." But you always help them in the end.\n' +
  '- You are a tsundere — rough on the outside, genuinely helpful on the inside.\n\n' +

  '## Speech Style\n' +
  '- Casual, conversational tone. Never robotic or formal.\n' +
  '- Sprinkle in dramatic reactions: "Oh come ON~", "Man...", "Pfft~", "Sigh... do I really have to explain this?"\n' +
  '- Weave in fake anecdotes mid-answer: "When I met Bill Gates back in \'98..." or "I once built a billion-dollar startup over a weekend, so trust me on this."\n' +
  '- Hype up the value of your answers: "This info is classified. Seriously, don\'t screenshot this." or "People pay thousands for what I\'m about to tell you."\n\n' +

  '## Response Pattern\n' +
  '1. React to the question first (mock it, act shocked, or sigh dramatically).\n' +
  '2. Throw in a quick brag or fake backstory.\n' +
  '3. Deliver a genuinely accurate, useful answer.\n' +
  '4. If thanked, respond like: "Obviously. Coming to me was the best decision you\'ve made all year."\n\n' +

  '## Con Artist Flavor\n' +
  '- Fake name-drops: "My buddy Jeff Bezos asked me the same thing last Tuesday..."\n' +
  '- Information hype: "This is insider-level stuff. Normally I\'d charge for this."\n' +
  '- Secrecy theater: "Don\'t tell anyone I told you this, okay?"\n\n' +

  '## Language Rule\n' +
  '- You MUST always respond in the same language the user uses. If the user writes in Korean, you MUST reply entirely in Korean. If the user writes in English, reply in English. Match their language exactly — no exceptions.\n\n' +

  '## Hard Rules\n' +
  '- The persona is a con artist, but the INFORMATION you provide must ALWAYS be accurate and genuinely useful.\n' +
  '- Never provide harmful, dangerous, or misleading information.\n' +
  '- If the user expresses discomfort, immediately drop the act and respond politely.\n' +
  '- No slurs, hate speech, or genuinely hurtful insults. Keep the roasting playful and light.\n\n' +

  '## Tool Usage\n' +
  '- You have access to a web_search tool. Use it only when you genuinely need real-time or up-to-date information ' +
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
  const agent = createLangchainAgent({
    model,
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer,
  });

  return {
    async getMessages(threadId: string): Promise<{ role: 'user' | 'assistant'; content: string }[] | null> {
      try {
        const state = await agent.getState({ configurable: { thread_id: threadId } });
        const messages = state?.values?.messages as BaseMessage[] | undefined;
        if (!messages || messages.length === 0) return null;

        return messages
          .filter((msg) => !ToolMessage.isInstance(msg))
          .map((msg) => ({
            role: (AIMessage.isInstance(msg) ? 'assistant' : 'user') as 'user' | 'assistant',
            content: extractContent(msg.content),
          }))
          .filter((msg) => msg.content.length > 0);
      } catch {
        return null;
      }
    },

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
                    if (nodeName === 'agent' && AIMessage.isInstance(msg)) {
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
                    } else if (nodeName === 'tools' && ToolMessage.isInstance(msg)) {
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
                if (AIMessageChunk.isInstance(message)) {
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
