import axios from './axios';

const BASE = '/api/hercules-ai';

export const herculesAIApi = {
  scan:            ()          => axios.post(`${BASE}/scan`, {}, { timeout: 120000 }),
  getProfiles:     ()          => axios.get(`${BASE}/profiles`),
  bulkUpdate:      (profiles)  => axios.put(`${BASE}/profiles/bulk`, { profiles }),
  bulkDelete:      (ids)       => axios.delete(`${BASE}/profiles/bulk`, { data: { ids } }),
  updateProfile:   (id, data)  => axios.put(`${BASE}/profiles/${id}`, data),
  getConfig:       ()          => axios.get(`${BASE}/config`),
  updateConfig:    (data)      => axios.put(`${BASE}/config`, data),
  getStatus:       ()          => axios.get(`${BASE}/status`),
  previewSummary:  ()          => axios.post(`${BASE}/preview-summary`, {}, { timeout: 60000 }),
  testConnection:  ()          => axios.post(`${BASE}/test-connection`),
  insights:        (data)      => axios.post(`${BASE}/insights`, data, { timeout: 120000 }),
  previewCharts:   (data)      => axios.post(`${BASE}/preview-charts`, data),
  chartData:       (data)      => axios.post(`${BASE}/chart-data`, data),
};
