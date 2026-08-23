'use client';

import { Toaster } from 'react-hot-toast';

/**
 * Global toast host. Mounted once in the root layout.
 * Use the `toast` export from 'react-hot-toast' anywhere:
 *   import toast from 'react-hot-toast';
 *   toast.success('Saved');
 *   toast.error('Something went wrong');
 */
export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      gutter={8}
      toastOptions={{
        duration: 4000,
        style: {
          background: '#0f1613',
          color: '#e7f2ec',
          border: '1px solid #212e28',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          padding: '0.65rem 0.9rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        },
        success: {
          iconTheme: { primary: '#3fe07d', secondary: '#0f1613' },
        },
        error: {
          iconTheme: { primary: '#f87171', secondary: '#0f1613' },
        },
        loading: {
          iconTheme: { primary: '#3fe07d', secondary: '#0f1613' },
        },
      }}
    />
  );
}
