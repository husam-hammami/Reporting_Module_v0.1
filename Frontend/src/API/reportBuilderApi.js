import axios from './axios';

const BASE = '/api/report-builder/templates';

export const reportBuilderApi = {
  list: () => axios.get(BASE),
  get: (id) => axios.get(`${BASE}/${id}`),
  create: (data) => axios.post(BASE, data),
  update: (id, data) => axios.put(`${BASE}/${id}`, data),
  delete: (id) => axios.delete(`${BASE}/${id}`),
  duplicate: (id) => axios.post(`${BASE}/${id}/duplicate`),
};
