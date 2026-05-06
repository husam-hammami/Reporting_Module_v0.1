import axios from './axios';

const BASE = '/api/hercules-ai';

/**
 * Sole consumer after the AI consolidation: Settings → AI page.
 * Email AI summary was removed — a new path will be built from scratch later.
 */
export const herculesAIApi = {
  scan:           ()         => axios.post(`${BASE}/scan`, {}, { timeout: 120000 }),
  getProfiles:    ()         => axios.get(`${BASE}/profiles`),
  bulkUpdate:     (profiles) => axios.put(`${BASE}/profiles/bulk`, { profiles }),
  getConfig:      ()         => axios.get(`${BASE}/config`),
  updateConfig:   (data)     => axios.put(`${BASE}/config`, data),
  testConnection: ()         => axios.post(`${BASE}/test-connection`),
};
