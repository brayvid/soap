// packages/web/src/app/politician/[id]/page.tsx
import type { Metadata } from 'next';
import { PoliticianPageClient } from '@/components/PoliticianPageClient';
import { notFound } from 'next/navigation';

// --- TYPE DEFINITIONS for the data being fetched ---
type LayoutPoint = { id: number; x: number; y: number; };
type Politician = { politician_id: number; name: string; position: string; };
type Vote = { word: string; count: number; sentiment_score: number; last_voted_at: string; };
type LayoutData = { canvasWidth: number; canvasHeight: number; all_points: LayoutPoint[]; };

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

// The props object is explicitly typed inline
export async function generateMetadata(
  { params }: { params: { id: string } }
): Promise<Metadata> {
  const id = params.id;
  const data = await getInitialData(id);

  if (!data?.politician) {
    return {
      title: 'Politician Not Found',
    };
  }

  return {
    title: `${data.politician.name} | Public Sentiment on Soap`,
    description: `View real-time polling data and public sentiment for ${data.politician.name}.`,
    alternates: {
      canonical: `/politician/${id}`,
    },
  };
}

// The same explicit inline type is used here
export default async function PoliticianPage(
  { params }: { params: { id: string } }
) {
  const id = params.id;
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