// packages/web/src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Import Google Font
import Script from 'next/script'; // Import Next.js Script component

import './globals.css'; // Your global CSS file
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { ToastProvider } from '@/context/ToastContext';

// Configure the Inter font using Next.js font optimization
const inter = Inter({
  subsets: ['latin'],
  display: 'swap', // Ensures the font is displayed smoothly
});

export const metadata: Metadata = {
  title: 'Soap | Public Polling',
  description: 'Explore real-time political sentiment with Soap.',
  // Add favicon here
  icons: {
    icon: '/favicon.ico', // Assuming favicon.ico is in your public/ directory
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Apply the font to the html tag
    <html lang="en" className={inter.className}>
      <head>
        {/* Google Analytics script - placed in <head> for global loading */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-MCWMGMG51E"
          strategy="afterInteractive" // Loads after the page is interactive
        />
        <Script id="google-analytics">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-MCWMGMG51E');
          `}
        </Script>
        {/* Other head elements like meta, title, etc., are handled by Next.js <Metadata> */}
      </head>
      <body>
        <ToastProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}