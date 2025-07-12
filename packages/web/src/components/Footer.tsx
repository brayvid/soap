// packages/web/src/components/Footer.tsx
export function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="footer">
      <p>
        © Copyright 2024-{currentYear}{' '}
        <a className="footer-link" href="https://www.soap.fyi">
          soap.fyi
        </a>
        <br />
        All rights reserved.{' '}
        <a className="footer-link" href="https://www.soap.fyi/terms">
          Terms & Conditions
        </a>
      </p>
    </footer>
  );
}