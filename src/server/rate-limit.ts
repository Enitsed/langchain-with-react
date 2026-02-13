const WINDOW_MS = 60_000; // 1분
const MAX_REQUESTS = 10; // 분당 최대 요청

const requests = new Map<string, number[]>();

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = requests.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    requests.set(ip, recent);
    return true;
  }

  recent.push(now);
  requests.set(ip, recent);
  return false;
}

// 5분마다 만료된 엔트리 정리
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requests) {
    const recent = timestamps.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) requests.delete(ip);
    else requests.set(ip, recent);
  }
}, 300_000);
