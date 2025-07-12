// packages/web/src/app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      <section style={{
        maxWidth: '600px',
        margin: '20px auto',
        background: 'white',
        borderRadius: '8px',
        padding: '2rem',
        boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
      }}>
        <h1 style={{ fontSize: '3rem', color: '#76B0DF', marginBottom: '1rem' }}>
          404
        </h1>
        {/*
          CRITICAL FIX: Changed ' to ' in "you're" and "doesn't"
          This resolves the reaåct/no-unescaped-entities ESLint error.
        */}
        <p style={{ fontSize: '1.25rem', marginBottom: '2rem' }}>
          Oops! The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/" style={{ color: '#76B0DF', fontWeight: 'bold', textDecoration: 'none' }}>
          ← Back to Home
        </Link>
      </section>
    </div>
  );
}