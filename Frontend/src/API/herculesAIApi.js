import axios from './axios';

const BASE = '/api/hercules-ai';

export const herculesAIApi = {
  scan:            ()          => axios.post(`${BASE}/scan`),
  getProfiles:     ()          => axios.get(`${BASE}/profiles`),
  bulkUpdate:      (profiles)  => axios.put(`${BASE}/profiles/bulk`, { profiles }),
  bulkDelete:      (ids)       => axios.delete(`${BASE}/profiles/bulk`, { data: { ids } }),
  updateProfile:   (id, data)  => axios.put(`${BASE}/profiles/${id}`, data),
  getConfig:       ()          => axios.get(`${BASE}/config`),
  updateConfig:    (data)      => axios.put(`${BASE}/config`, data),
  getStatus:       ()          => axios.get(`${BASE}/status`),
  previewSummary:  ()          => axios.post(`${BASE}/preview-summary`),
  testConnection:  ()          => axios.post(`${BASE}/test-connection`),
  insights:        (data)      => axios.post(`${BASE}/insights`, data),
};
