/**
 * DigitalTwinPage
 * ----------------
 * Loads the Mill B 3D digital-twin prototype via iframe and bridges
 * live PLC tag data from SocketIO into the Three.js scene.
 *
 * Data flow:
 *   1. On mount, fetches initial tag values via REST API
 *   2. Subscribes to SocketIO 'live_tag_data' events for real-time updates
 *   3. Posts tag values into the iframe via postMessage
 *   4. The HTML listens for 'hercules-live-tags' messages and updates its tags object
 *
 * The iframe HTML is at Frontend/public/mill-b-digital-twin.html
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../../Context/SocketContext';

// Actual PLC tag names from the database (lowercase, underscore-separated).
// These match the twin's internal `tags` object keys exactly.
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
  // M31 Reduction
  'm31_effective_power', 'm31_cos_phi', 'm31_apparent_power',
  'm31_reactive_power', 'm31_total_active_energy',
  'm31_l1_current', 'm31_l2_current', 'm31_l3_current',
  // Production flows & totalizers
  'mil_b_flour_flowrate', 'mil_b_flour_percentage', 'mil_b_flour_totalizer',
  'mil_b_bran_flowrate', 'mil_b_bran_percentage', 'mil_b_bran_totalizer',
  'mil_b_b1_flowrate', 'mil_b_b1_percentage', 'mil_b_b1_totalizer',
  'mil_b_job_flowrate',
  // Booleans
  'mil_b_dampening_on', 'mil_b_vitamin_feeder_on', 'mil_b_vitamin_feeder_percentage',
  'mil_b_enable_small_sifters', 'mil_b_filter_flour_feeder', 'mil_b_mill_emptying',
  'mil_b_order_active', 'mil_b_order_active_499',
  // Senders
  'mil_b_sender_id_1', 'mil_b_sender_qty_pct_1',
  'mil_b_sender_id_2', 'mil_b_sender_qty_pct_2',
  'mil_b_sender_id_3', 'mil_b_sender_qty_pct_3',
  // Destinations
  'mil_b_dest_id_1', 'mil_b_dest_id_2',
  // Pasta
  'pasta_1_521we_totalizer', 'pasta_4_830we_totalizer', 'pasta_e_1010_totalizer',
];

const DigitalTwinPage = () => {
  const iframeRef = useRef(null);
  const { socket } = useSocket();

  // Send tag values to the iframe
  const pushToTwin = useCallback((tagValues) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      { type: 'hercules-live-tags', values: tagValues },
      '*'
    );
  }, []);

  // Fetch initial tag values via REST
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        const { default: axios } = await import('../../API/axios');
        const res = await axios.get('/api/live-monitor/tags', {
          params: { tags: TWIN_TAGS.join(',') },
          timeout: 5000,
        });
        if (res.data?.status === 'success' && res.data.tag_values) {
          pushToTwin(res.data.tag_values);
        }
      } catch (e) {
        console.warn('[DigitalTwin] Initial tag fetch failed:', e.message);
      }
    };

    // Wait for iframe to load before sending data
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', () => {
        fetchInitial();
        // Also poll every 3 seconds as fallback for tags not on SocketIO
        const poller = setInterval(fetchInitial, 3000);
        return () => clearInterval(poller);
      });
    }
  }, [pushToTwin]);

  // Subscribe to SocketIO for real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleLiveData = (data) => {
      if (data?.tag_values) {
        pushToTwin(data.tag_values);
      }
    };

    socket.on('live_tag_data', handleLiveData);
    return () => socket.off('live_tag_data', handleLiveData);
  }, [socket, pushToTwin]);

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
