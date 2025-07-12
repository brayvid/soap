// packages/web/src/components/AddPoliticianForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';

export function AddPoliticianForm() {
  const [newName, setNewName] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const router = useRouter();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL}/politicians`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, position: newPosition }),
      });

      if (res.ok) {
        setNewName('');
        setNewPosition('');
        showToast('Politician added successfully!', 'success');
        router.refresh();
      } else {
        const err = await res.json();
        showToast(err.error || 'Unknown error', 'error');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      showToast('Network error. Please try again.', 'error');
    }
  };

  return (
    <form id="add-politician-form" onSubmit={handleSubmit}>
      <input
        type="text"
        id="name"
        name="name"
        placeholder="Name"
        maxLength={30}
        required
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
      />
      <input
        type="text"
        id="position"
        name="position"
        placeholder="Position"
        maxLength={30}
        required
        value={newPosition}
        onChange={(e) => setNewPosition(e.target.value)}
      />
      <button type="submit">Add Politician</button>
    </form>
  );
}
