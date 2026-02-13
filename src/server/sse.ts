const encoder = new TextEncoder();

export function sseEncode(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export function sseDone(): Uint8Array {
  return encoder.encode('data: [DONE]\n\n');
}

export function sseError(message: string): Uint8Array {
  return sseEncode({ error: message });
}
