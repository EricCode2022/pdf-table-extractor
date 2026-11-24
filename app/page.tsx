import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Dropzone } from '@/components/upload/Dropzone';
import { ShieldCheck, FileSpreadsheet, UserRound, UploadCloud, Table2, Download, ArrowRight } from 'lucide-react';

const steps = [
  { icon: UploadCloud, title: 'Upload PDF', desc: 'Select your document' },
  { icon: Table2, title: 'Extract Tables', desc: 'Detect and preview tables' },
  { icon: Download, title: 'Export Data', desc: 'Download Excel or CSV' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto">
        <Header />
      </div>

      <section className="max-w-6xl mx-auto px-6 pt-6 pb-12">
        <div className="grid lg:grid-cols-[1fr_420px] gap-10 items-start">
          <div>
            <p className="text-[11px] tracking-[.12em] text-primary uppercase">PDF Table Extractor</p>
            <h1 className="text-[44px] leading-[1.1] tracking-tight mt-3">Extract Tables<br />from PDF to Excel</h1>
            <p className="text-[15px] text-muted mt-4 max-w-md">
              Convert PDF tables into editable Excel and CSV files in seconds.
            </p>

            <div className="mt-8 max-w-[520px]">
              <Dropzone />
            </div>

            <div className="flex flex-wrap gap-6 mt-6">
              <div className="trust-item"><ShieldCheck size={17} className="text-success" /> Secure Processing</div>
              <div className="trust-item"><FileSpreadsheet size={17} className="text-success" /> Excel &amp; CSV Export</div>
              <div className="trust-item"><UserRound size={17} className="text-success" /> No Signup Required</div>
            </div>

            <div className="mt-12">
              <h2 className="text-center text-[18px] tracking-tight">How it Works</h2>
              <div className="flex items-center justify-center gap-4 mt-6">
                {steps.map((step, i) => (
                  <div key={step.title} className="flex items-center gap-4">
                    <div className="flex flex-col items-center w-[120px]">
                      <div className="w-14 h-14 rounded-full bg-blue-50 text-primary flex items-center justify-center relative">
                        <step.icon size={22} />
                        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">{i + 1}</span>
                      </div>
                      <div className="text-[13px] mt-3">{step.title}</div>
                      <div className="text-[11px] text-muted text-center">{step.desc}</div>
                    </div>
                    {i < steps.length - 1 && <ArrowRight size={18} className="text-slate-300" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden lg:block relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent rounded-3xl" />
            <div className="relative flex items-center justify-center h-[420px]">
              <div className="w-[220px] h-[280px] bg-white rounded-xl shadow-card border border-line p-5 rotate-[-6deg]">
                <div className="h-3 w-20 bg-slate-200 rounded mb-4" />
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <div key={r} className="grid grid-cols-3 gap-2">
                      <div className="h-5 bg-blue-50 rounded" />
                      <div className="h-5 bg-slate-50 rounded" />
                      <div className="h-5 bg-slate-50 rounded" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="absolute bottom-20 right-10 w-14 h-14 bg-green-50 border border-green-200 rounded-lg flex items-center justify-center text-success shadow-card">
                <FileSpreadsheet size={26} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-6 text-center text-[12px] text-muted">
        <Link href="/privacy" className="hover:text-primary mx-2">Privacy</Link>
        <Link href="/terms" className="hover:text-primary mx-2">Terms</Link>
        <Link href="/how-it-works" className="hover:text-primary mx-2">How it Works</Link>
      </footer>
    </main>
  );
}
