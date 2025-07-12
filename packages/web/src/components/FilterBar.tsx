// packages/web/src/components/FilterBar.tsx
'use client';

import { useMemo, useState } from 'react';
import { PoliticianGrid } from './PoliticianGrid';

type Word = { word: string; score: number };
type Politician = {
  politician_id: number;
  name: string;
  position: string;
  vote_count: number;
  top_words: Word[];
  search_words?: string[];
};

type Props = {
  politicians: Politician[];
};

export function FilterBar({ politicians }: Props) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter) return politicians;
    const lower = filter.toLowerCase();
    return politicians.filter((p) => {
      const terms = [p.name, p.position, ...(p.search_words || [])].join(' ').toLowerCase();
      return terms.includes(lower);
    });
  }, [filter, politicians]);

  return (
    <>
      <input
        type="text"
        id="filter-input"
        placeholder="Search for politicians..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <section id="politician-grid-container">
        <PoliticianGrid politicians={filtered} />
      </section>
    </>
  );
}
