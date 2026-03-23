import axios from './axios';

const BASE = '/api/distribution/rules';

export const distributionApi = {
  listRules: () => axios.get(BASE),
  createRule: (data) => axios.post(BASE, data),
  updateRule: (id, data) => axios.put(`${BASE}/${id}`, data),
  deleteRule: (id) => axios.delete(`${BASE}/${id}`),
  runRule: (id) => axios.post(`${BASE}/${id}/run`),
};
