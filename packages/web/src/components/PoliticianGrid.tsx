// packages/web/src/components/PoliticianGrid.tsx
import Link from 'next/link';
import { getSentimentStyle } from '@/lib/styleUtils';

type Word = { word: string; score: number };
type Politician = {
  politician_id: number;
  name: string;
  position: string;
  vote_count: number;
  top_words: Word[];
};

export function PoliticianGrid({ politicians }: { politicians: Politician[] }) {
  return (
    <div id="politician-grid">
      {politicians.map((p) => (
        <Link
          href={`/politician/${p.politician_id}`}
          key={p.politician_id}
          className="politician-card"
        >
          <div className="politician-bubble">{p.vote_count || 0}</div>
          <div className="politician-name">{p.name}</div>
          <div className="politician-position">{p.position}</div>
          <div className="politician-top-words">
            {p.top_words.length > 0 ? (
              p.top_words.map((w) => (
                <span key={w.word} className="word-tag" style={getSentimentStyle(w.score)}>
                  {w.word}
                </span>
              ))
            ) : (
              <span className="word-tag muted">No words yet</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
