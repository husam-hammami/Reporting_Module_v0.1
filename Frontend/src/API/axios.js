import axios from 'axios';

const isDev = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;
const primaryURL = import.meta.env.VITE_API_URL || (isProduction ? '/' : 'http://localhost:5001');
const LOCAL_FALLBACK = 'http://localhost:5001';
const isExplicitRemoteUrl = isDev && import.meta.env.VITE_API_URL && primaryURL !== LOCAL_FALLBACK;

// In dev: if primary API is unreachable (e.g. VPN off), use local backend so app always works.
// .env.local is gitignored — push/pull won't change your API choice.
let effectiveBaseURL = primaryURL;
let didTryFallback = false;

/** Current API base URL (may have switched to local fallback in dev). Use for fetch() or socket URL. */
export function getApiBaseUrl() {
  return effectiveBaseURL;
}

/** True when user set VITE_API_URL to a remote server (e.g. VPN). Callers should not fall back to localStorage. */
export function isExplicitRemoteApi() {
  return !!isExplicitRemoteUrl;
}

/** Switch to local backend (dev only). Called when primary is unreachable so socket/fetch can reconnect. */
export function setApiFallback() {
  if (import.meta.env.DEV && !didTryFallback) {
    didTryFallback = true;
    effectiveBaseURL = LOCAL_FALLBACK;
    axiosInstance.defaults.baseURL = LOCAL_FALLBACK;
    console.warn('[Axios] Using local backend:', LOCAL_FALLBACK);
  }
}

const AUTH_TOKEN_KEY = 'auth_token';

const axiosInstance = axios.create({
  withCredentials: true,
  baseURL: primaryURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request: use effective base URL (may have switched to local fallback in dev)
axiosInstance.interceptors.request.use((config) => {
  config.baseURL = effectiveBaseURL;
  try {
    const token = typeof localStorage !== 'undefined' && localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (effectiveBaseURL && effectiveBaseURL.includes('ngrok-free.dev')) {
      config.headers['ngrok-skip-browser-warning'] = 'true';
    }
  } catch (_) {}
  return config;
});

// Response: in dev, on network error retry once with local backend so connection "always works"
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      } catch (_) {}
      if (typeof window !== 'undefined' && window.location?.pathname !== '/login') {
        console.warn('⚠️ [Axios] 401 Unauthorized - Session may have expired. Please login again.');
      }
      return Promise.reject(error);
    }

    const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.message?.includes('Network'));
    const canFallback = isDev && !didTryFallback && primaryURL && primaryURL !== LOCAL_FALLBACK && !isExplicitRemoteUrl && error.config;

    if (isNetworkError && canFallback) {
      didTryFallback = true;
      effectiveBaseURL = LOCAL_FALLBACK;
      axiosInstance.defaults.baseURL = LOCAL_FALLBACK;
      console.warn('[Axios] Primary API unreachable, using local backend:', LOCAL_FALLBACK);
      return axiosInstance.request({ ...error.config, baseURL: LOCAL_FALLBACK });
    }

    return Promise.reject(error);
  }
);

// In dev, probe primary API once so fallback is set before any page runs (connection "always works")
// Skip probe when user explicitly set VITE_API_URL to a remote (e.g. VPN) so we stay on that server
if (isDev && primaryURL && primaryURL !== LOCAL_FALLBACK && !isExplicitRemoteUrl) {
  fetch(`${primaryURL.replace(/\/$/, '')}/api/report-builder/templates`, {
    method: 'GET',
    signal: AbortSignal.timeout(15000),
    credentials: 'include',
  }).catch(() => {
    didTryFallback = true;
    effectiveBaseURL = LOCAL_FALLBACK;
    axiosInstance.defaults.baseURL = LOCAL_FALLBACK;
    console.warn('[Axios] Primary API unreachable, using local backend:', LOCAL_FALLBACK);
  });
}

export default axiosInstance;
export { AUTH_TOKEN_KEY };