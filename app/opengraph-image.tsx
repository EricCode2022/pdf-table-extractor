import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'PDF Table Extractor — Extract Tables from PDF to Excel';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: 80,
        background: 'linear-gradient(135deg, #ffffff 0%, #eef3ff 100%)',
        fontFamily: 'sans-serif',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: '#315EE8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 26,
          }}>PDF</div>
          <div style={{ fontSize: 30, color: '#172033' }}>PDF Table Extractor</div>
        </div>
        <div style={{ fontSize: 68, lineHeight: 1.15, color: '#172033', marginBottom: 24 }}>
          Extract Tables from PDF to Excel
        </div>
        <div style={{ fontSize: 30, color: '#64748B' }}>
          Convert PDF tables into editable Excel and CSV files in seconds.
        </div>
      </div>
    ),
    size
  );
}
