// packages/web/src/components/HomePage.tsx
import { PoliticianGrid } from './PoliticianGrid';
import { AddPoliticianForm } from './AddPoliticianForm';
import { FilterBar } from './FilterBar';

type Word = { word: string; score: number };
type Politician = {
  politician_id: number;
  name: string;
  position: string;
  vote_count: number;
  top_words: Word[];
  search_words?: string[];
};

type HomePageProps = {
  politicians: Politician[];
};

export async function HomePage({ politicians }: HomePageProps) {
  return (
    <>
      <section id="instructions">
        <p><strong>Welcome to Soap, where you can see how the public describes politicians. Click on a politician to add your opinion.</strong></p>
      </section>

      {/* Client component for filter input */}
      <FilterBar politicians={politicians} />

      <section id="add-politician">
        <h2>Add a New Politician</h2>
        <AddPoliticianForm />
      </section>
    </>
  );
}
