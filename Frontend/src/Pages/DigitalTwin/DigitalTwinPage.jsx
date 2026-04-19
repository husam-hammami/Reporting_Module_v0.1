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

// Tag names in the PLC that map to the Digital Twin's internal tags.
// The twin strips "MilB_" / "Mil_B_" prefix and lowercases to match.
const TWIN_TAGS = [
  // Electrical — C32 Cleaning
  'MilB_C32_Effective_Power', 'MilB_C32_Cos_Phi', 'MilB_C32_Apparent_Power',
  'MilB_C32_Reactive_Power', 'MilB_C32_Total_Active_Energy',
  'MilB_C32_L1_Current', 'MilB_C32_L2_Current', 'MilB_C32_L3_Current',
  'MilB_C32_L1_Voltage', 'MilB_C32_L2_Voltage', 'MilB_C32_L3_Voltage',
  // M30 Break
  'MilB_M30_Effective_Power', 'MilB_M30_Cos_Phi', 'MilB_M30_Apparent_Power',
  'MilB_M30_Reactive_Power', 'MilB_M30_Total_Active_Energy',
  'MilB_M30_L1_Current', 'MilB_M30_L2_Current', 'MilB_M30_L3_Current',
  // M31 Reduction
  'MilB_M31_Effective_Power', 'MilB_M31_Cos_Phi', 'MilB_M31_Apparent_Power',
  'MilB_M31_Reactive_Power', 'MilB_M31_Total_Active_Energy',
  'MilB_M31_L1_Current', 'MilB_M31_L2_Current', 'MilB_M31_L3_Current',
  // Production flows & totalizers
  'MilB_Flour_FlowRate', 'MilB_Flour_Percentage', 'Flour',
  'MilB_Bran_FlowRate', 'MilB_Bran_Percentage', 'mil_b_bran_totalizer',
  'MilB_B1_FlowRate', 'MilB_B1_Percentage', 'B1',
  'MilB_Job_FlowRate',
  // Booleans
  'Dampening_On', 'Vitamin_Feeder_On', 'MilB_Vitamin_Feeder_Percentage',
  'MilB_Enable_Small_Sifters', 'Filter_Flour_Feeder', 'Mill_Emptying',
  // Bin levels
  'B1_Percentage', 'Bin_32_Flowrate',
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
