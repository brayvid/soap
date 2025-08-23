// packages/web/src/app/politician/[id]/page.tsx
import type { Metadata } from 'next';
import { PoliticianPageClient } from '@/components/PoliticianPageClient';
import { notFound } from 'next/navigation';

// Define the types for the data we will fetch and pass
type Politician = { politician_id: number; name: string; position: string; };
type Vote = { word: string; count: number; sentiment_score: number; last_voted_at: string; };
type LayoutData = { canvasWidth: number; canvasHeight: number; all_points: any[]; };

// Define the shape of the props this page will receive from Next.js
type Props = {
  params: { id: string };
};

// This function fetches all the initial data needed for the page on the server
async function getInitialData(id: string) {
  const apiUrl = process.env.SOAP_API_URL;
  if (!apiUrl) {
    console.error("CRITICAL: SOAP_API_URL environment variable is not set!");
    return null;
  }

  try {
    const [politicianRes, layoutRes] = await Promise.all([
      fetch(`${apiUrl}/politician/${id}/data`, { cache: 'no-store' }),
      fetch(`${apiUrl}/data/layout-${id}.json`, { cache: 'no-store' })
    ]);

    if (!politicianRes.ok) {
      return null; // Politician doesn't exist, will lead to a 404
    }

    const politicianData = await politicianRes.json();
    const layout = layoutRes.ok ? await layoutRes.json() : null;

    return {
      politician: politicianData.politician as Politician,
      initialVotes: politicianData.votesForPolitician as Vote[],
      layout: layout as LayoutData | null,
    };
  } catch (error) {
    console.error(`Failed to fetch initial data for politician ${id}:`, error);
    return null;
  }
}

// This function generates the dynamic metadata (title, description, canonical) on the server
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // --- FIX START: Explicitly declare `id` here ---
  const id = params.id;
  // --- FIX END ---

  const data = await getInitialData(id);

  if (!data?.politician) {
    return {
      title: 'Politician Not Found',
    };
  }

  return {
    title: `${data.politician.name} | Public Sentiment on Soap`,
    description: `View real-time polling data and public sentiment for ${data.politician.name}.`,
    // This generates the correct canonical URL for each politician
    alternates: {
      canonical: `/politician/${id}`, // --- FIX: Use the explicitly declared `id` ---
    },
  };
}

// The page component is now async. It fetches data and passes it to the client component.
export default async function PoliticianPage({ params }: Props) {
  // --- FIX START: Explicitly declare `id` here ---
  const id = params.id;
  // --- FIX END ---

  const initialData = await getInitialData(id);

  if (!initialData) {
    notFound(); // Triggers a 404 page if the politician isn't found
  }

  return (
    <PoliticianPageClient
      politician={initialData.politician}
      initialVotes={initialData.initialVotes}
      layout={initialData.layout}
    />
  );
}