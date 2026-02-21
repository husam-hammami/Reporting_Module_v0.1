import { useQuery } from '@tanstack/react-query';

interface ActiveOrderData {
  job_type_id: number;
  os_comment: string;
  final_product: number;
  recipe_name: string;
  line_running: boolean;
  active_sources: Array<{
    bin_id: number;
    prd_name: string;
    qty_percent: number;
    produced_qty: number;
  }>;
  active_destination: {
    bin_id: number;
    prd_name: string;
  };
  kpi_definitions: Array<{
    kpi_name: string;
    default_value: number;
    unit: string;
    bit_value?: number;
  }>;
}

interface SensorData {
  [key: string]: {
    bin_id: number;
    value: number;
    unit: string;
  };
}

interface FCLData {
  flow_rate: number;
  moisture_setpoint: number;
  moisture_offset: number;
  receiver: number;
}

export function useDashboardData(jobTypeId: number) {
  const mockActiveOrder = {
    job_type_id: jobTypeId,
    os_comment: 'Line Running',
    final_product: 101,
    recipe_name: 'Standard Recipe',
    line_running: true,
    active_sources: [
      { bin_id: 21, prd_name: 'Source A', qty_percent: 75, produced_qty: 1500 },
      { bin_id: 23, prd_name: 'Source B', qty_percent: 25, produced_qty: 500 },
    ],
    active_destination: {
      bin_id: 30,
      prd_name: 'Output Product',
    },
    kpi_definitions: [
      { kpi_name: 'Flow Rate', default_value: 25.0, unit: 'kg/h' },
      { kpi_name: 'Moisture SP', default_value: 15.0, unit: '%' },
      { kpi_name: 'Moisture Offset', default_value: -3.0, unit: '%' },
    ],
  };

  const mockSensorData = {
    '0021': { bin_id: 21, value: 0, unit: 'kg' },
    '0023': { bin_id: 23, value: 0, unit: 'kg' },
    '0025': { bin_id: 25, value: 0, unit: 'kg' },
  };

  const mockFclData = {
    flow_rate: 24.0,
    moisture_setpoint: 15.8,
    moisture_offset: -3.8,
    receiver: 30,
    produced_weight: 0.0,
    consumed_weight: 0.0,
    efficiency: 94.9,
  };

  return {
    activeOrder: mockActiveOrder,
    sensorData: mockSensorData,
    fclData: mockFclData,
    isLoading: false,
    error: null,
  };
}

export function useJobTypes() {
  return [
    { id: 9, name: 'FCL' },
    { id: 10, name: 'SDLA' },
  ];
}
