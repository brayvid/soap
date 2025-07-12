// packages/web/src/components/HomePage.tsx
"use client"; // This directive is CRUCIAL. It marks this as a Client Component.

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSentimentStyle } from '@/lib/styleUtils';
import { useToast } from '@/context/ToastContext';

// Define the types for our data
type Word = { word: string; score: number; };
type Politician = {
  politician_id: number;
  name: string;
  position: string;
  vote_count: number;
  top_words: Word[];
  search_words?: string[];
};

type HomePageProps = {
  politicians: Politician[]; // It receives the list of politicians as a prop
};

export function HomePage({ politicians }: HomePageProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filter, setFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState('');

  // Filter politicians based on user input
  const filteredPoliticians = useMemo(() => {
    if (!filter) return politicians;
    const lowercasedFilter = filter.toLowerCase();
    return politicians.filter(p => {
      const searchTerms = [ p.name.toLowerCase(), p.position.toLowerCase(), ...(p.search_words || []) ].join(' ');
      return searchTerms.includes(lowercasedFilter);
    });
  }, [filter, politicians]);

  // Handle the form submission to add a new politician
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL}/politicians`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, position: newPosition }),
      });

      // --- THIS IS THE FIX ---
      // Check if the request was successful (status 200-299)
      if (response.ok) {
        setNewName('');
        setNewPosition('');
        showToast('Politician added successfully!', 'success');
        router.refresh();
      } else {
        // If not successful, it's an expected API error (like 429 or 409).
        // We handle it gracefully without throwing an error.
        const errorData = await response.json();
        // Use the specific message from the API in our toast.
        showToast(errorData.error || 'An unknown error occurred.', 'error');
      }
      // --- END OF FIX ---

    } catch (error) {
      // This 'catch' block is now only for true network errors (e.g., server is down)
      console.error("Network/Fetch Error:", error);
      showToast('Could not connect to the server.', 'error');
    }
  };

  return (
    <>
      <section id="instructions">
        <p><strong>Welcome to Soap, where you can see how the public describes politicians. Click on a politician to add your opinion.</strong></p>
      </section>

      <input
        type="text"
        id="filter-input"
        placeholder="Search for politicians..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <section id="politician-grid-container">
        <div id="politician-grid">
          {filteredPoliticians.map((p) => (
            <Link href={`/politician/${p.politician_id}`} key={p.politician_id} className="politician-card">
              <div className="politician-bubble">{p.vote_count || 0}</div>
              <div className="politician-name">{p.name}</div>
              <div className="politician-position">{p.position}</div>
              <div className="politician-top-words">
                {p.top_words && p.top_words.length > 0 ? (
                  p.top_words.map((w) => ( <span key={w.word} className="word-tag" style={getSentimentStyle(w.score)}>{w.word}</span> ))
                ) : (
                  <span className="word-tag muted">No words yet</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="add-politician">
        <h2>Add a New Politician</h2>
        <form id="add-politician-form" onSubmit={handleSubmit}>
          <input type="text" id="name" name="name" placeholder="Name" maxLength={30} required value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input type="text" id="position" name="position" placeholder="Position" maxLength={30} required value={newPosition} onChange={(e) => setNewPosition(e.target.value)} />
          <button type="submit">Add Politician</button>
        </form>
      </section>
    </>
  );
}