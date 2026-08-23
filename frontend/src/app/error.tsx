'use client';

import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Unhandled UI error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-base-950 text-[#e7f2ec] antialiased flex items-center justify-center px-6">
        <div className="max-w-sm text-center space-y-4">
          <AlertOctagon size={32} className="mx-auto text-red-400" />
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-[#8ea095]">
            An unexpected error occurred. You can try again, or reload the page.
          </p>
          <button
            onClick={reset}
            className="rounded-md bg-signal-500 text-base-950 font-medium px-4 py-2 hover:bg-signal-400 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
