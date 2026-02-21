import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const BODY_RADIUS = 1;
const BODY_HEIGHT = 3;

function SceneBackground({ transparent = true }) {
  const { scene } = useThree();
  useEffect(() => {
    scene.background = transparent ? null : new THREE.Color('#1e1b4b');
  }, [scene, transparent]);
  return null;
}

// Glass cylinder: transparent with rim highlight (Fresnel-like)
const GLASS_RIM_VERT = `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const GLASS_RIM_FRAG = `
  precision mediump float;
  uniform vec3 uBaseColor;
  uniform vec3 uRimColor;
  uniform float uOpacity;
  uniform float uRimPower;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float rim = pow(1.0 - max(dot(vNormal, viewDir), 0.0), uRimPower);
    vec3 color = mix(uBaseColor, uRimColor, rim);
    float alpha = uOpacity + rim * 0.5;
    gl_FragColor = vec4(color, alpha);
  }
`;

function SiloBody() {
  const bodyUniforms = useMemo(() => ({
    uBaseColor: { value: new THREE.Color(0.45, 0.52, 0.62) },
    uRimColor: { value: new THREE.Color(0.7, 0.9, 1.0) },
    uOpacity: { value: 0.12 },
    uRimPower: { value: 3.8 },
  }), []);
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[BODY_RADIUS, BODY_RADIUS, BODY_HEIGHT, 32]} />
        <shaderMaterial
          vertexShader={GLASS_RIM_VERT}
          fragmentShader={GLASS_RIM_FRAG}
          uniforms={bodyUniforms}
          transparent
          depthWrite={true}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Thin glowing top rim */}
      <mesh position={[0, BODY_HEIGHT / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[BODY_RADIUS + 0.015, 0.022, 16, 48]} />
        <meshStandardMaterial
          color="#a5d6ff"
          emissive="#7dd3fc"
          emissiveIntensity={0.85}
          transparent
          opacity={0.95}
        />
      </mesh>
    </group>
  );
}

function lightenHex(hex, t) {
  const c = new THREE.Color(hex);
  const w = new THREE.Color(0xffffff);
  c.lerp(w, t);
  return c.getStyle();
}

function darkenHex(hex, t) {
  const c = new THREE.Color(hex);
  const b = new THREE.Color(0x111111);
  c.lerp(b, t);
  return c.getStyle();
}

function SiloFill({ fillPercent, fillColor }) {
  const fillHeight = Math.max(0.02, BODY_HEIGHT * (fillPercent / 100));
  const fillY = -BODY_HEIGHT / 2 + fillHeight / 2;
  const levelTopY = -BODY_HEIGHT / 2 + fillHeight;

  const liquidTopColor = useMemo(() => lightenHex(fillColor, 0.35), [fillColor]);
  const liquidBottomColor = useMemo(() => darkenHex(fillColor, 0.45), [fillColor]);

  if (fillPercent <= 0) return null;

  return (
    <group>
      {/* Main fill: darker toward bottom (single mesh with darker color; surface ring does "lighter top") */}
      <mesh position={[0, fillY, 0]}>
        <cylinderGeometry args={[BODY_RADIUS * 0.96, BODY_RADIUS * 0.96, fillHeight, 32]} />
        <meshStandardMaterial
          color={liquidBottomColor}
          metalness={0.02}
          roughness={0.92}
          emissive={liquidBottomColor}
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* Liquid surface ring: lighter, more vibrant (gradient effect) */}
      <mesh position={[0, levelTopY, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[BODY_RADIUS * 0.92, BODY_RADIUS * 0.96, 32]} />
        <meshStandardMaterial
          color={liquidTopColor}
          emissive={liquidTopColor}
          emissiveIntensity={0.6}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

/** Subtle luminous disc under the cylinder */
function GroundGlow() {
  return (
    <mesh position={[0, -BODY_HEIGHT / 2 - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[BODY_RADIUS * 1.4, 32]} />
      <meshBasicMaterial
        color="#312e81"
        transparent
        opacity={0.4}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function ToneMapping() {
  const { gl } = useThree();
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
  }, [gl]);
  return null;
}

function Scene({ fillPercent, fillColor }) {
  return (
    <>
      <SceneBackground />
      <ToneMapping />
      <ambientLight intensity={0.42} />
      <directionalLight position={[4, 5, 4]} intensity={0.5} color="#c8e0ff" />
      <directionalLight position={[-2, 3, -3]} intensity={0.35} color="#88bbff" />
      <directionalLight position={[0, 4, 2]} intensity={0.2} color="#ffffff" />
      <GroundGlow />
      <SiloBody />
      <SiloFill fillPercent={fillPercent} fillColor={fillColor} />
    </>
  );
}

/**
 * 3D silo: transparent glass cylinder, thin glowing top rim, gradient liquid fill.
 * Props: fillPercent (0-100), fillColor (hex string). No cone roof; elegant soft lighting.
 */
export default function Silo3DScene({ fillPercent = 0, fillColor = '#3b82f6', width, height }) {
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;
  return (
    <div
      className="w-full h-full min-h-[180px]"
      style={{
        width: width || '100%',
        height: height || '100%',
        boxSizing: 'border-box',
        background: 'transparent',
      }}
    >
      <Canvas
        camera={{ position: [2.4, 1, 5.2], fov: 36 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        dpr={[1, dpr]}
        style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }}
        frameloop="always"
      >
        <Scene fillPercent={fillPercent} fillColor={fillColor} />
      </Canvas>
    </div>
  );
}
