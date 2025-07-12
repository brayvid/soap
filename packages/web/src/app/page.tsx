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
  const apiUrl = process.env.SOAP_API_URL || 'http://localhost:3001'; // Default to localhost for local dev

  try {
    const res = await fetch(`${apiUrl}/politicians`, {
      // --- CHANGE THIS LINE ---
      // Instead of cache: 'no-store', use revalidate for ISR
      // Here, the data will be re-fetched from the API every 60 seconds
      next: {
        revalidate: 60, // Data will be fresh for at least 60 seconds (1 minute)
      },
    });

    if (!res.ok) {
      console.error(`API fetch failed for URL: ${apiUrl}/politicians`);
      // It's good practice to log the response body for more context on errors
      const errorBody = await res.text();
      console.error("API Error Response:", errorBody);
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