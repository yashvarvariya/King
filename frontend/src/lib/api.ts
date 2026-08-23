import axios from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

// withCredentials so the httpOnly refresh-token cookie is sent to /auth/refresh
// and /auth/logout. The access token itself still travels as a Bearer header.
export const api = axios.create({ baseURL: API_URL, withCredentials: true });

export function getStoredToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A single in-flight refresh is shared across every request that hits a 401
// at the same time, so a page with several parallel requests doesn't fire
// off several competing /auth/refresh calls (which would race to rotate the
// same refresh-token cookie).
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then((res) => {
        const token = res.data?.accessToken as string;
        setStoredToken(token);
        return token;
      })
      .catch(() => {
        setStoredToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const { config, response } = err;
    const isAuthEndpoint = config?.url?.startsWith('/auth/login') || config?.url?.startsWith('/auth/refresh');

    if (typeof window !== 'undefined' && response?.status === 401 && !config?._retried && !isAuthEndpoint) {
      config._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      }
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export type ServerStatus = 'INSTALLING' | 'OFFLINE' | 'RUNNING' | 'STOPPING' | 'SUSPENDED' | 'ERRORED';

export interface BotServer {
  id: string;
  name: string;
  description?: string;
  status: ServerStatus;
  runtime: 'NODEJS' | 'PYTHON';
  startupCommand?: string;
  runtimeEngineId?: string | null;
  runtimeVersionId?: string | null;
  suspended: boolean;
  autoRestart: boolean;
  memoryLimitMb: number;
  cpuLimitPercent: number;
  diskLimitMb: number;
  createdAt: string;
  envVars?: { key: string; value: string }[];
}
