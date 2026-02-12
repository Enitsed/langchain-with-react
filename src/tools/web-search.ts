import { tool } from '@langchain/core/tools';
import { z } from 'zod';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// DuckDuckGo HTML 페이지에서 검색 결과를 파싱하는 함수
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  const html = await response.text();
  const results: SearchResult[] = [];

  // HTML을 결과 블록 단위로 분할
  const blocks = html.split(/class="result\s+results_links\s+results_links_deep/);

  for (let i = 1; i < blocks.length && results.length < 5; i++) {
    const block = blocks[i];
    if (block == null) continue;

    // 제목, 스니펫, URL을 정규식으로 추출
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const urlMatch = block.match(/class="result__url"[^>]*href="([^"]*)"/);

    const title = titleMatch?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
    const snippet = snippetMatch?.[1]?.replace(/<[^>]*>/g, '').trim() ?? '';
    const url = urlMatch?.[1]?.trim() ?? '';

    if (title) {
      results.push({ title, snippet, url });
    }
  }

  return results;
}

// 웹 검색 도구 정의 (LangChain tool 형식)
export const webSearchTool = tool(
  async ({ query }): Promise<string> => {
    try {
      const results = await searchDuckDuckGo(query);

      if (results.length === 0) {
        return `No search results found for "${query}".`;
      }

      return results
        .map(
          (r, i) =>
            `${i + 1}. ${r.title}${r.snippet ? `\n   ${r.snippet}` : ''}${r.url ? `\n   Source: ${r.url}` : ''}`,
        )
        .join('\n\n');
    } catch (error) {
      return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  },
  {
    name: 'web_search',
    description:
      'Search the web for current information. Use this tool whenever you need up-to-date information, facts, news, statistics, or data about any topic. You should prefer using this tool over relying on your training data for anything time-sensitive.',
    schema: z.object({
      query: z.string().describe('The search query to look up on the web'),
    }),
  },
);
