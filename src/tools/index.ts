import { webSearchTool } from './web-search';

export const tools = [webSearchTool];

export const toolsByName: Record<string, (typeof tools)[number]> = Object.fromEntries(
  tools.map((t) => [t.name, t]),
);

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const toolFn = toolsByName[name];
  if (toolFn == null) {
    return `Tool "${name}" not found.`;
  }
  const output = await (toolFn.invoke as (input: Record<string, unknown>) => Promise<unknown>)(args);
  if (output == null) return '';
  return typeof output === 'string' ? output : JSON.stringify(output);
}
