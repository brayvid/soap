// packages/web/src/app/page.tsx

import React, { Suspense } from 'react';
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
  const apiUrl = process.env.SOAP_API_URL || 'http://localhost:3001';

  try {
    const res = await fetch(`${apiUrl}/politicians`, {
      next: {
        // --- CHANGE THIS ---
        tags: ['politicians-list'], // Assign a specific cache tag
        // --- TO THIS ---
      },
    });

    if (!res.ok) {
      console.error(`API fetch failed for URL: ${apiUrl}/politicians`);
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

export default function Home() {
  return (
    <Suspense fallback={<div>Loading politicians...</div>}>
      <HomePageWrapper />
    </Suspense>
  );
}

async function HomePageWrapper() {
  const politicians = await getPoliticians();
  return <HomePage politicians={politicians} />;
}