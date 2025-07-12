// packages/web/src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ToastProvider } from '@/context/ToastContext'; // <-- Import the provider

export const metadata: Metadata = {
  title: 'Soap | Public Polling',
  description: 'Explore real-time political sentiment with Soap.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* --- THIS IS THE FIX --- */}
        <ToastProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </ToastProvider>
        {/* --- END OF FIX --- */}
      </body>
    </html>
  );
}