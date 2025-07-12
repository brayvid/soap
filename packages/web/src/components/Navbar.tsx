// packages/web/src/components/Navbar.tsx
import Link from 'next/link';

export function Navbar() {
  return (
    <nav className="navbar">
      <Link href="/">Home</Link>
      <div className="navbar-title">Public Polling</div>
      <div className="navbar-right-menu">
        <a href="https://www.dash.soap.fyi">Dash</a>
      </div>
    </nav>
  );
}