/**
 * DigitalTwinPage
 * ----------------
 * Loads the Mill B 3D digital-twin prototype (a self-contained Three.js scene)
 * via an iframe so the prototype renders byte-for-byte identical to the
 * standalone file in `prototypes/mill_b_digital_twin_v3.html`.
 *
 * The HTML lives at `Frontend/public/mill-b-digital-twin.html` and is served
 * by Vite at the root path.
 *
 * Layout: the iframe fills 100% of the routed page area
 * (Home.jsx wraps every page in `<div id="main-scroll-container"
 * className="h-[calc(100vh-72px)] overflow-auto">`). The app's top bar and
 * sidebar remain visible and functional — the 3D canvas takes the
 * remaining viewport.
 *
 * Do not modify the prototype here — edit the HTML file directly if changes
 * are needed.
 */
import React from 'react';

const DigitalTwinPage = () => {
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
        title="Salalah Mill B — Digital Twin"
        src="/mill-b-digital-twin.html"
        style={{
          border: 'none',
          width: '100%',
          height: '100%',
          display: 'block',
          flex: 1,
        }}
        // Allow Three.js / WebGL / pointer-lock / fullscreen
        allow="fullscreen; xr-spatial-tracking; pointer-lock"
      />
    </div>
  );
};

export default DigitalTwinPage;
