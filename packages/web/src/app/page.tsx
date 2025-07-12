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
  try {
    const res = await fetch('http://localhost:3001/politicians', { cache: 'no-store' });
    if (!res.ok) throw new Error('API fetch failed');
    return res.json();
  } catch (error) {
    console.error("Server-side fetch error:", error);
    return [];
  }
}

// There is only ONE default export in this file.
export default async function Home() {
  const politicians = await getPoliticians();
  return <HomePage politicians={politicians} />;
}