import "./globals.css";
import Link from "next/link";

export const metadata = { title: "NyayaFlow AI", description: "Judicial case readiness assistant" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <Link href="/" className="brand">⚖️ NyayaFlow AI</Link>
          <span className="tag">Pre-hearing case readiness · Decision-support only</span>
        </header>
        <main>{children}</main>
        <footer>Prototype for Seva Innovation Challenge. Not legal advice. Human verification required.</footer>
      </body>
    </html>
  );
}
