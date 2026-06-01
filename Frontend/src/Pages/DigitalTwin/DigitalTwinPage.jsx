/**
 * DigitalTwinPage — Live PLC data bridge for the 3D Digital Twin.
 *
 * Bridges live tag data from the Hercules backend into the Three.js iframe
 * via postMessage. Two data paths:
 *   - SocketIO 'live_tag_data' (every 1s, ALL tags from cache)
 *   - REST fallback '/api/live-monitor/tags' (every 3s, when SocketIO disconnected)
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useSocket } from '../../Context/SocketContext';
import axios from '../../API/axios';

// PLC tag names from the database (see seed_mil_b_tags.py + seed_power_tags.py).
// These match the twin's `tags` object keys exactly (lowercase, underscore-separated).
const TWIN_TAGS = [
  // Electrical — C32 Cleaning
  'c32_effective_power', 'c32_cos_phi', 'c32_apparent_power',
  'c32_reactive_power', 'c32_total_active_energy',
  'c32_l1_current', 'c32_l2_current', 'c32_l3_current',
  'c32_l1_voltage', 'c32_l2_voltage', 'c32_l3_voltage',
  // M30 Break
  'm30_effective_power', 'm30_cos_phi', 'm30_apparent_power',
  'm30_reactive_power', 'm30_total_active_energy',
  'm30_l1_current', 'm30_l2_current', 'm30_l3_current',
  'm30_l1_voltage', 'm30_l2_voltage', 'm30_l3_voltage',
  // M31 Reduction
  'm31_effective_power', 'm31_cos_phi', 'm31_apparent_power',
  'm31_reactive_power', 'm31_total_active_energy',
  'm31_l1_current', 'm31_l2_current', 'm31_l3_current',
  'm31_l1_voltage', 'm31_l2_voltage', 'm31_l3_voltage',
  // Production flows & totalizers
  'mil_b_flour_flowrate', 'mil_b_flour_percentage', 'mil_b_flour_totalizer',
  'mil_b_bran_flowrate', 'mil_b_bran_percentage', 'mil_b_bran_totalizer',
  'mil_b_b1_flowrate', 'mil_b_b1_percentage', 'mil_b_b1_totalizer',
  'mil_b_job_flowrate',
  // Booleans
  'mil_b_dampening_on', 'mil_b_vitamin_feeder_on', 'mil_b_vitamin_feeder_percentage',
  'mil_b_enable_small_sifters', 'mil_b_filter_flour_feeder', 'mil_b_mill_emptying',
  'mil_b_b1_scale', 'mil_b_b1_deopt_emptying',
  'mil_b_order_active', 'mil_b_order_active_499',
  // Senders & Destinations
  'mil_b_sender_id_1', 'mil_b_sender_qty_pct_1',
  'mil_b_sender_id_2', 'mil_b_sender_qty_pct_2',
  'mil_b_sender_id_3', 'mil_b_sender_qty_pct_3',
  'mil_b_dest_id_1', 'mil_b_dest_id_2',
  // Pasta
  'pasta_1_521we_totalizer', 'pasta_4_830we_totalizer', 'pasta_e_1010_totalizer',
  // NOTE: Silo fills (silo_021_fill etc.), FCL bins (fcl_bin_*), and internal
  // tags (_orderId etc.) are twin-only computed values — no PLC source.
];

const TWIN_TAG_SET = new Set(TWIN_TAGS);

const DigitalTwinPage = () => {
  const iframeRef = useRef(null);
  const pollerRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);
  const { socket, isConnected } = useSocket();

  // Post filtered tag values into the iframe
  const pushToTwin = useCallback((tagValues) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !iframeReady) return;

    const filtered = {};
    for (const [k, v] of Object.entries(tagValues)) {
      const key = k.toLowerCase();
      if (TWIN_TAG_SET.has(key)) filtered[key] = v;
    }
    if (!Object.keys(filtered).length) return;

    try {
      iframe.contentWindow.postMessage(
        { type: 'hercules-live-tags', values: filtered },
        '*' // same-origin would be ideal but iframe served from same host
      );
    } catch (e) {
      // iframe may have navigated away or been destroyed
    }
  }, [iframeReady]);

  // Fetch via REST API
  const fetchAndPush = useCallback(async () => {
    try {
      const res = await axios.get('/api/live-monitor/tags', {
        params: { tags: TWIN_TAGS.join(',') },
        timeout: 5000,
      });
      if (res.data?.status === 'success' && res.data.tag_values) {
        pushToTwin(res.data.tag_values);
      }
    } catch (_) { /* silent — will retry */ }
  }, [pushToTwin]);

  // When iframe is ready, do initial fetch + start polling
  useEffect(() => {
    if (!iframeReady) return;

    // Immediate fetch
    fetchAndPush();

    // Always poll every 3s — SocketIO supplements this but REST is the reliable path
    pollerRef.current = setInterval(fetchAndPush, 3000);

    return () => {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
    };
  }, [iframeReady, fetchAndPush]);

  // SocketIO subscription — pushes data on top of REST polling
  useEffect(() => {
    if (!socket || !iframeReady) return;

    const handleLiveData = (data) => {
      if (data?.tag_values) {
        pushToTwin(data.tag_values);
      }
    };

    socket.on('live_tag_data', handleLiveData);
    return () => socket.off('live_tag_data', handleLiveData);
  }, [socket, iframeReady, pushToTwin]);

  return (
    <div
      style={{
        width: '100%',
        height: 'calc(100vh - 72px)',
        background: '#06101c',
        display: 'flex',
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        title="Salalah Mill B — Digital Twin"
        src="/mill-b-digital-twin.html"
        onLoad={() => setIframeReady(true)}
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          display: 'block',
          flex: 1,
        }}
        allow="fullscreen; xr-spatial-tracking; pointer-lock"
      />
    </div>
  );
};

export default DigitalTwinPage;
