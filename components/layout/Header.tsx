import Link from 'next/link';
import { Table2, ShieldCheck } from 'lucide-react';

export function Header({ secure = false }: { secure?: boolean }) {
  return (
    <header className="site-header">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="logo-mark"><Table2 size={20} /></span>
        <span className="text-[16px] tracking-tight">PDF Table Extractor</span>
      </Link>
      <div className="flex items-center gap-5">
        {secure ? (
          <span className="flex items-center gap-1.5 text-[11px] text-success bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
            <ShieldCheck size={14} /> Your files are private and secure
          </span>
        ) : (
          <nav className="flex items-center gap-5">
            <Link href="/how-it-works" className="nav-link">How it Works</Link>
            <Link href="/privacy" className="nav-link">Privacy</Link>
            <Link href="/terms" className="nav-link">Terms</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
