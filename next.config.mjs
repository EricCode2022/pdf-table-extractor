/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep pdfjs as an external package so its internal relative worker path is not
  // rewritten by webpack; Vercel then loads the original legacy build at runtime.
  serverExternalPackages: ['pdfjs-dist', 'exceljs'],
  experimental: {
    // Vercel's file tracer otherwise omits the dynamically imported pdf.worker.mjs.
    outputFileTracingIncludes: {
      '/**/*': [
        './node_modules/pdfjs-dist/**/*',
        './node_modules/.pnpm/pdfjs-dist@*/node_modules/pdfjs-dist/**/*',
      ],
    },
    // Never bundle locally uploaded temp files into the deployment.
    outputFileTracingExcludes: {
      '/**/*': ['./.tmp/**/*'],
    },
  },
};

export default nextConfig;
