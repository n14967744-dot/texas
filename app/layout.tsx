import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'CTWP · Project Explorer', description: 'Construction project browser for CTWP office territories.', robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
