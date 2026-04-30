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

  // Plan 5 — ROI Genius Layer endpoints
  getRoiPayload:   ()                  => axios.get(`${BASE}/roi-payload`),
  getAssetHealth:  ()                  => axios.get(`${BASE}/asset-health`),
  getSec:          (asset, hours = 24) => axios.get(`${BASE}/sec`, { params: { asset, hours } }),
  getPfStatus:     (asset)             => axios.get(`${BASE}/pf-status`, { params: { asset } }),
  getSavings:      (includeEntries = false) => axios.get(`${BASE}/savings`,
      { params: includeEntries ? { include_entries: 'true' } : {} }),
  getLevers:       (limit = 3)         => axios.get(`${BASE}/levers`, { params: { limit } }),
  attributeSavings: (id)               => axios.post(`${BASE}/savings/${id}/attribute`),
  disputeSavings:  (id, note = '')     => axios.post(`${BASE}/savings/${id}/dispute`, { note }),

  // Plan 5 — Phase B (Crystal Ball)
  getForecasts:    ()                  => axios.get(`${BASE}/forecasts`),
  getAnomalies:    (limit = 10)        => axios.get(`${BASE}/anomalies`, { params: { limit } }),
  anomalyFeedback: (id, label, note='')=> axios.post(`${BASE}/anomalies/${id}/feedback`, { label, note }),
  suppressAnomaly: (id)                => axios.post(`${BASE}/anomalies/${id}/suppress`),
  getTrustScore:   ()                  => axios.get(`${BASE}/trust-score`),
  getModelHealth:  ()                  => axios.get(`${BASE}/model-health`),
};
