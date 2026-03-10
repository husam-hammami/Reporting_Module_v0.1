/**
 * Shared mappings cache - fetches mappings from the API and caches them.
 * Falls back to localStorage for backward compatibility during migration.
 */
import axios from '../API/axios';

let cachedMappings = null;
let fetchPromise = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Get mappings synchronously from cache. Returns empty array if not yet loaded.
 * Call refreshMappingsCache() to trigger an async load.
 */
export function getCachedMappings() {
  if (cachedMappings !== null) return cachedMappings;

  // Fallback: try localStorage while API hasn't loaded yet
  try {
    const raw = localStorage.getItem('system_mappings_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }

  return [];
}

/**
 * Refresh the mappings cache from the API (non-blocking).
 */
export function refreshMappingsCache() {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS && cachedMappings !== null) return;
  if (fetchPromise) return; // already fetching

  fetchPromise = axios.get('/api/mappings')
    .then(res => {
      const list = res.data?.mappings || [];
      cachedMappings = list;
      lastFetchTime = Date.now();
    })
    .catch(() => {
      // Keep old cache or fallback to localStorage
    })
    .finally(() => {
      fetchPromise = null;
    });
}

/**
 * Force-invalidate the cache (call after create/update/delete).
 */
export function invalidateMappingsCache() {
  cachedMappings = null;
  lastFetchTime = 0;
}

// Listen for mappingsUpdated events to invalidate cache
if (typeof window !== 'undefined') {
  window.addEventListener('mappingsUpdated', () => {
    invalidateMappingsCache();
    refreshMappingsCache();
  });
}
