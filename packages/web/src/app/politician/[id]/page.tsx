// packages/web/src/app/politician/[id]/page.tsx
import { PoliticianPageClient } from '@/components/PoliticianPageClient';

// This page no longer fetches data. It only renders the client component.
export default function PoliticianPage() {
  return <PoliticianPageClient />;
}