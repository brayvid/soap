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

async function getPoliticians(): Promise<Politician[] | null> { // Return null on error
  const apiUrl = process.env.SOAP_API_URL;

  // --- ADD THIS CHECK ---
  if (!apiUrl) {
    console.error("CRITICAL: SOAP_API_URL environment variable is not set!");
    return null; // Fail fast if the URL is missing
  }
  
  try {
    console.log(`Fetching politicians from production URL: ${apiUrl}/politicians`); // Log the URL being used
    
    const res = await fetch(`${apiUrl}/politicians`, {
      next: {
        tags: ['politicians-list'],
      },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      // --- MORE DETAILED LOGGING ---
      console.error(`API fetch failed with status: ${res.status}`);
      console.error(`Failing URL: ${apiUrl}/politicians`);
      console.error("API Error Response Body:", errorBody);
      return null; // Return null instead of an empty array
    }

    return res.json();
  } catch (error) {
    console.error("A critical server-side fetch error occurred:", error);
    return null; // Return null on network or other errors
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

  // --- ADD THIS ERROR HANDLING ---
  if (politicians === null) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
        <h2>Failed to load politicians.</h2>
        <p>There was an error connecting to the server.</p>
      </div>
    );
  }

  return <HomePage politicians={politicians} />;
}