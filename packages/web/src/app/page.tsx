// packages/web/src/app/page.tsx
import { HomePage } from '@/components/HomePage';

type Politician = {
  politician_id: number;
  name: string;
  position: string;
  vote_count: number;
  top_words: { word: string; score: number }[];
  search_words?: string[];
};

async function getPoliticians(): Promise<Politician[]> {
  // This function runs on the server, so it should use the internal API URL.
  let apiUrl: string;
  if (process.env.API_INTERNAL_URL) {
    apiUrl = process.env.API_INTERNAL_URL;
  } else {
    // Fallback for local development if API_INTERNAL_URL is not set in .env.local
    // For local dev, we use localhost directly.
    apiUrl = 'http://localhost:3001';
  }

  try {
    const res = await fetch(`${apiUrl}/politicians`, { cache: 'no-store' });
    if (!res.ok) {
      // Log the URL that failed for debugging
      console.error(`API fetch failed for URL: ${apiUrl}/politicians`);
      throw new Error('API fetch failed');
    }
    return res.json();
  } catch (error) {
    console.error("Server-side fetch error:", error);
    return [];
  }
}

export default async function Home() {
  const politicians = await getPoliticians();
  return <HomePage politicians={politicians} />;
}


