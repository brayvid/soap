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
  // --- THIS IS THE FINAL FIX ---
  // Use the API service name directly, as provided by Railway's environment.
  // Railway automatically sets up environment variables like SOAP_API_URL if you create a reference.
  const apiUrl = process.env.SOAP_API_URL || 'http://localhost:3001'; // Default to localhost for local dev
  
  try {
    const res = await fetch(`${apiUrl}/politicians`, { cache: 'no-store' });
    if (!res.ok) {
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