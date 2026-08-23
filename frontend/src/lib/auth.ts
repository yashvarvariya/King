'use client';

import { useEffect, useState } from 'react';
import { api, getStoredToken, setStoredToken } from './api';

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
  role: 'USER' | 'ADMIN';
  emailVerified: boolean;
  suspended: boolean;
  isPremium?: boolean;
  maxServers: number;
  maxMemoryMb: number;
  maxDiskMb: number;
  maxCpuPercent: number;
}

export function useAuth() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      let token = getStoredToken();

      // No access token in this tab (fresh page load, browser restart, or
      // it simply expired) — try the httpOnly refresh cookie silently
      // before giving up, so "stay logged in" survives closing the browser.
      if (!token) {
        try {
          const res = await api.post('/auth/refresh');
          token = res.data?.accessToken || null;
          setStoredToken(token);
        } catch {
          setStoredToken(null);
          setLoading(false);
          return;
        }
      }

      try {
        const res = await api.get('/auth/me');
        setUser(res.data);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort — clear local state regardless of whether the API call succeeded.
    }
    setStoredToken(null);
    window.location.href = '/login';
  };

  return { user, loading, logout };
}
