/* ===== ATLAS v2 — 3D scenes (Motor + Milling) =====
 * EXACT byte-for-byte port from prototypes/hercules_atlas_final.html
 * (the merged Claude Design source). The only adaptations from the
 * original are mechanical:
 *   - take the canvas as a function argument instead of getElementById
 *   - import THREE from npm instead of relying on window.THREE
 *   - return a cleanup function for React useEffect, with
 *     forceContextLoss + dispose so StrictMode re-mounts get a fresh
 *     WebGL context
 * Geometries, materials, colors, lighting, particle counts/colors/sizes,
 * speeds and animation tuning are preserved verbatim. Do NOT introduce
 * additional meshes (halos, piles, ghosts, etc.) — those are added in
 * the surrounding HTML overlay layer.
 */

import * as THREE from 'three';

/* ============ 3D MOTOR SCENE — M31 grinding section ============ */
export function initMotorScene(canvas) {
  if (!canvas) return () => {};

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  // FOV widened (38 -> 42) and camera pulled back so the motor sits with breathing room
  // inside the enlarged .af-stage; previously the body and shaft were clipping at the
  // canvas edges as the scene rotated.
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(2.9, 1.7, 3.7);
  camera.lookAt(0, 0, 0);

  function size() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(r.height, 1);
    camera.updateProjectionMatrix();
  }
  size();
  window.addEventListener('resize', size);

  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;
  if (renderer.toneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping || THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ---------- LIGHTING (industrial three-point + cyan/amber rims) ----------
  const hemi = new THREE.HemisphereLight(0xb8d4f0, 0x14171f, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e0, 1.15);
  key.position.set(3.5, 4.5, 3.0);
  scene.add(key);
  const fillCyan = new THREE.DirectionalLight(0x7fcfff, 0.55);
  fillCyan.position.set(-2.5, 1.0, 3.0);
  scene.add(fillCyan);
  const rim = new THREE.DirectionalLight(0xffb84d, 0.45);
  rim.position.set(-3, 0.8, -2.5);
  scene.add(rim);
  const front = new THREE.PointLight(0x22d3ee, 0.7, 6, 1.6);
  front.position.set(0, 0.4, 2.4);
  scene.add(front);

  const motor = new THREE.Group();

  // ---- Materials ----
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2c3650, metalness: 0.92, roughness: 0.34, emissive: 0x0a1424, emissiveIntensity: 0.25
  });
  // L2 phase imbalance hot zone: warm emissive band on one side of the body
  const bodyHotMat = new THREE.MeshStandardMaterial({
    color: 0x3a2a18, metalness: 0.88, roughness: 0.42,
    emissive: 0xf59e0b, emissiveIntensity: 0.6
  });
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: 0x3e4a64, metalness: 0.95, roughness: 0.22
  });
  const steelBrightMat = new THREE.MeshStandardMaterial({
    color: 0xc8d2dc, metalness: 0.95, roughness: 0.18
  });
  const steelDarkMat = new THREE.MeshStandardMaterial({
    color: 0x161c2a, metalness: 0.6, roughness: 0.55
  });
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0x1a2030, metalness: 0.85, roughness: 0.5
  });
  const couplingMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, metalness: 0.75, roughness: 0.35, emissive: 0x331400, emissiveIntensity: 0.55
  });

  // ---- Main motor body ----
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.6, 56), bodyMat);
  body.rotation.z = Math.PI / 2;
  motor.add(body);

  // ---- L2 imbalance hot zone (visible warm sector on the body) ----
  const hotZone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.701, 0.701, 0.55, 48, 1, true, -Math.PI / 4, Math.PI / 2),
    bodyHotMat
  );
  hotZone.rotation.z = Math.PI / 2;
  hotZone.position.x = 0.05;
  motor.add(hotZone);

  // ---- Radial cooling fins (industrial motor look) ----
  const finCount = 18;
  for (let i = 0; i < finCount; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.18, 0.04), ridgeMat);
    const a = (i / finCount) * Math.PI * 2;
    fin.position.set(0, Math.cos(a) * 0.78, Math.sin(a) * 0.78);
    fin.rotation.x = a;
    motor.add(fin);
  }
  // tighter ribbed rings between the fins
  for (let i = 0; i < 14; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.018, 6, 40), ridgeMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -0.7 + (i / 13) * 1.4;
    motor.add(ring);
  }

  // ---- End bells (drive end and non-drive end) with bolt circles ----
  const bellGeo = new THREE.CylinderGeometry(0.78, 0.72, 0.18, 36);
  const bellMat = new THREE.MeshStandardMaterial({
    color: 0x1e2638, metalness: 0.75, roughness: 0.45
  });
  const bellDE = new THREE.Mesh(bellGeo, bellMat);
  bellDE.rotation.z = Math.PI / 2; bellDE.position.x = 0.85;
  motor.add(bellDE);
  const bellNDE = bellDE.clone(); bellNDE.position.x = -0.85; motor.add(bellNDE);
  [0.94, -0.94].forEach((bx) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), boltMat);
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(bx, Math.cos(a) * 0.62, Math.sin(a) * 0.62);
      motor.add(bolt);
    }
  });

  // ---- Junction box on top + cable conduit ----
  const jb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.46),
    new THREE.MeshStandardMaterial({ color: 0x1e2638, metalness: 0.65, roughness: 0.5 }));
  jb.position.set(0, 0.86, 0); motor.add(jb);
  // cover bolts
  [[-0.18, 0.86, 0.235], [0.18, 0.86, 0.235], [-0.18, 0.86, -0.235], [0.18, 0.86, -0.235]].forEach((pos) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), boltMat);
    b.position.set(pos[0], pos[1] + 0.16, pos[2]);
    motor.add(b);
  });
  // conduit pipe + bend
  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 14), steelDarkMat);
  conduit.position.set(0.13, 1.2, 0); motor.add(conduit);
  const conduitBend = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), steelDarkMat);
  conduitBend.position.set(0.13, 1.45, 0); motor.add(conduitBend);

  // ---- Mounting feet with anchor bolts ----
  const footMat = new THREE.MeshStandardMaterial({ color: 0x161c2a, metalness: 0.55, roughness: 0.65 });
  [0.5, -0.5].forEach((fx) => {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.55), footMat);
    foot.position.set(fx, -0.78, 0);
    motor.add(foot);
    [-0.18, 0.18].forEach((dz) => {
      const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10), boltMat);
      fb.position.set(fx, -0.71, dz);
      motor.add(fb);
    });
  });

  // ---- Output shaft (drive end) with keyway notch ----
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.55, 24), steelBrightMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 1.2;
  motor.add(shaft);
  const keyway = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x404858, metalness: 0.7, roughness: 0.4 }));
  keyway.position.set(1.25, 0.12, 0);
  motor.add(keyway);

  // ---- Coupling with engagement teeth ----
  const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.22, 32), couplingMat);
  coupling.rotation.z = Math.PI / 2;
  coupling.position.x = 1.5;
  motor.add(coupling);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.06), couplingMat);
    tooth.position.set(1.5, Math.cos(a) * 0.18, Math.sin(a) * 0.18);
    motor.add(tooth);
  }

  // ---- Fan grille on the non-drive end ----
  const fanGroup = new THREE.Group();
  const fanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.04, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0x556070, metalness: 0.7, roughness: 0.4 })
  );
  fanRing.rotation.y = Math.PI / 2;
  fanGroup.add(fanRing);
  for (let i = 0; i < 8; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.48, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.6, roughness: 0.5 })
    );
    const a = (i / 8) * Math.PI * 2;
    blade.position.set(0, Math.cos(a) * 0.27, Math.sin(a) * 0.27);
    blade.rotation.x = a;
    fanGroup.add(blade);
  }
  fanGroup.position.x = -0.98;
  motor.add(fanGroup);
  // grille bars across the fan housing
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 1.1, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x252b3a, metalness: 0.7, roughness: 0.45 })
    );
    bar.position.set(-1.06, 0, -0.5 + i * 0.25);
    motor.add(bar);
  }

  // ---- Nameplate on the body with 4 plate bolts ----
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x101824, metalness: 0.5, roughness: 0.6 }));
  plate.position.set(-0.05, 0.18, 0.71);
  motor.add(plate);
  [[-0.16, 0.06], [0.06, 0.06], [-0.16, 0.27], [0.06, 0.27]].forEach(([px, py]) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), boltMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(px - 0.05, py, 0.71);
    motor.add(b);
  });

  // ---- Holographic vibration warning rings around the L2 hot zone ----
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.86, 0.014, 8, 80),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.75 })
  );
  halo.rotation.y = Math.PI / 2;
  halo.position.x = 0.05;
  motor.add(halo);
  const haloInner = new THREE.Mesh(
    new THREE.TorusGeometry(0.74, 0.008, 8, 80),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 })
  );
  haloInner.rotation.y = Math.PI / 2;
  haloInner.position.x = 0.05;
  motor.add(haloInner);

  // ---- Heat shimmer particles rising from the hot zone ----
  const shimmerCount = 40;
  const shimPos = new Float32Array(shimmerCount * 3);
  const shimSeeds = new Float32Array(shimmerCount);
  for (let i = 0; i < shimmerCount; i++) {
    shimSeeds[i] = Math.random();
    shimPos[i * 3] = 0.05 + (Math.random() - 0.5) * 0.4;
    shimPos[i * 3 + 1] = 0.5 + Math.random() * 0.6;
    shimPos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  const shimGeo = new THREE.BufferGeometry();
  shimGeo.setAttribute('position', new THREE.BufferAttribute(shimPos, 3));
  const shimMat = new THREE.PointsMaterial({
    color: 0xfbbf24, size: 0.025, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const shimmer = new THREE.Points(shimGeo, shimMat);
  motor.add(shimmer);

  motor.position.set(-0.3, 0.25, 0);
  scene.add(motor);
  motor.rotation.y = -0.3;

  // Subtle orbit
  let t = 0;
  let userSpin = 0;
  let hovering = false;

  canvas.style.cursor = 'grab';
  let dragging = false;
  let lastX = 0;
  const onDown = (e) => {
    dragging = true; lastX = e.clientX; canvas.style.cursor = 'grabbing';
  };
  const onUp = () => { dragging = false; canvas.style.cursor = 'grab'; };
  const onMove = (e) => {
    if (!dragging) return;
    userSpin += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
  };
  const onEnter = () => { hovering = true; };
  const onLeave = () => { hovering = false; };
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerenter', onEnter);
  canvas.addEventListener('pointerleave', onLeave);

  let raf = 0;
  function animate() {
    t += 0.016;
    fanGroup.rotation.x += 0.18;
    coupling.rotation.x += 0.18;
    motor.rotation.y = -0.3 + Math.sin(t * 0.3) * 0.18 + userSpin;
    motor.rotation.x = Math.sin(t * 0.4) * 0.05;

    // Halos pulse with the L2 vibration warning; hot-zone emissive breathes
    // alongside so the imbalance reads as "hot, alive, alarming".
    const pulse = (Math.sin(t * 4) + 1) / 2;
    halo.material.opacity = 0.4 + pulse * 0.5;
    halo.scale.setScalar(1 + pulse * 0.04);
    haloInner.material.opacity = 0.3 + pulse * 0.4;
    bodyHotMat.emissiveIntensity = 0.45 + pulse * 0.45;

    // Heat shimmer particles drift upward, recycle when they leave the band
    const sArr = shimmer.geometry.attributes.position.array;
    for (let i = 0; i < shimmerCount; i++) {
      sArr[i * 3 + 1] += 0.004 + shimSeeds[i] * 0.002;
      if (sArr[i * 3 + 1] > 1.3) {
        sArr[i * 3 + 1] = 0.5;
        sArr[i * 3]     = 0.05 + (Math.random() - 0.5) * 0.4;
        sArr[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      }
    }
    shimmer.geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerenter', onEnter);
    canvas.removeEventListener('pointerleave', onLeave);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    renderer.forceContextLoss?.();
    renderer.dispose();
  };
}

/* ============ 3D MILLING SCENE — realistic industrial line ============ */
export function initMillingScene(canvas) {
  if (!canvas) return () => {};

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (renderer.outputColorSpace !== undefined) renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;
  if (renderer.toneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping || THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  // Front-of-line camera. The story reads strictly left → right:
  //   hopper  →  break rollers  →  sifter (warning)  →  flour pile + bran pile
  // The previous ¾ camera orbit hid that sequence behind perspective foreshortening.
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  camera.position.set(0.5, 3.4, 11.5);
  camera.lookAt(0.5, 0.4, 0);

  // Stage anchors used to project HTML annotation pills back onto the canvas.
  const ANCHOR = {
    intake:  new THREE.Vector3(-5.5, 1.7, 0),
    rollers: new THREE.Vector3(-1.7, 1.0, 0),
    sifter:  new THREE.Vector3(1.6, 1.6, 0),
    flour:   new THREE.Vector3(4.0, -0.8, 1.0),
    bran:    new THREE.Vector3(4.0, -0.8, -1.0),
  };

  function size() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(r.height, 1);
    camera.updateProjectionMatrix();
  }
  size();
  window.addEventListener('resize', size);

  // ---------- LIGHTING — three-point + soft hemi for industrial photography feel ----------
  const hemi = new THREE.HemisphereLight(0xb8d4f0, 0x1a1d28, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff4e0, 1.05);
  key.position.set(6, 9, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x7fb6e8, 0.45);
  fill.position.set(-5, 4, 6);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fd4ff, 0.35);
  rim.position.set(-3, 3, -6);
  scene.add(rim);
  // soft cyan accent under the line for subtle plate-glow
  const accent = new THREE.PointLight(0x22d3ee, 0.55, 8, 1.6);
  accent.position.set(0, -0.4, 1.5);
  scene.add(accent);

  // ============ MATERIALS ============
  const matSteel    = new THREE.MeshStandardMaterial({ color: 0xc8d2dc, metalness: 0.85, roughness: 0.35 });
  const matSteelDark= new THREE.MeshStandardMaterial({ color: 0x4a5566, metalness: 0.9,  roughness: 0.4  });
  const matFrame    = new THREE.MeshStandardMaterial({ color: 0x1a2230, metalness: 0.6,  roughness: 0.55 });
  const matBolt     = new THREE.MeshStandardMaterial({ color: 0x222a36, metalness: 0.85, roughness: 0.5  });
  const matCream    = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, metalness: 0.4,  roughness: 0.55 });
  const matCreamWarn= new THREE.MeshStandardMaterial({ color: 0xe8dcc4, metalness: 0.4,  roughness: 0.55, emissive: 0xf59e0b, emissiveIntensity: 0.35 });
  const matRoller   = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, metalness: 0.95, roughness: 0.25 });
  const matDuct     = new THREE.MeshStandardMaterial({ color: 0x6b7785, metalness: 0.85, roughness: 0.35 });
  const matFloor    = new THREE.MeshStandardMaterial({ color: 0x0a1018, metalness: 0.55, roughness: 0.85 });
  const matGlass    = new THREE.MeshStandardMaterial({ color: 0x88b8d4, metalness: 0.2,  roughness: 0.15, transparent: true, opacity: 0.35 });

  // ============ FLOOR + GRID (wider — the line spans further left/right now) ============
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  scene.add(floor);
  const grid = new THREE.GridHelper(26, 26, 0x22d3ee, 0x0e1628);
  grid.material.opacity = 0.18; grid.material.transparent = true;
  grid.position.y = -1.59;
  scene.add(grid);

  // ============ STRUCTURAL FRAME (steel beams forming the mill skeleton) ============
  const frame = new THREE.Group();
  scene.add(frame);
  function beam(x, y, z, w, h, d, mat = matFrame) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    frame.add(m);
    return m;
  }
  // Vertical columns spanning the full line — 5 frames so the structure reads
  // continuously from intake on the left to the piles on the right.
  const colXs = [-4.6, -2.0, 0.4, 2.8, 5.0];
  const colZs = [-1.1, 1.1];
  colXs.forEach(cx => colZs.forEach(cz => beam(cx, 0.2, cz, 0.16, 3.4, 0.16)));
  [-1.4, 0.0, 1.6].forEach(y => {
    colZs.forEach(cz => beam(0.2, y, cz, 11.2, 0.08, 0.1));
    colXs.forEach(cx => beam(cx, y, 0, 0.1, 0.08, 2.4));
  });
  // catwalk grating at mid-level (front side)
  const catwalk = new THREE.Mesh(
    new THREE.BoxGeometry(11.2, 0.05, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x2a3344, metalness: 0.7, roughness: 0.6 })
  );
  catwalk.position.set(0.2, 0.05, 1.5);
  scene.add(catwalk);

  // ============ INTAKE TOWER (left, tall hopper feeding the line) ============
  const intake = new THREE.Group();
  intake.position.set(-5.5, 0, 0);
  scene.add(intake);
  // tall cylindrical silo body
  const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 24), matCream);
  silo.position.y = 0.8;
  intake.add(silo);
  // conical bottom
  const siloCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 24), matCream);
  siloCone.position.y = -0.65;
  siloCone.rotation.x = Math.PI;
  intake.add(siloCone);
  // top dome
  const siloTop = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), matCream);
  siloTop.position.y = 1.9;
  intake.add(siloTop);
  // band rings
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.025, 8, 32), matSteelDark);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.2 + i * 0.55;
    intake.add(ring);
  }
  // ladder
  const ladderRail1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.4, 0.04), matSteel);
  ladderRail1.position.set(0.6, 0.7, 0.18);
  intake.add(ladderRail1);
  const ladderRail2 = ladderRail1.clone();
  ladderRail2.position.z = -0.18;
  intake.add(ladderRail2);
  for (let i = 0; i < 8; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.36), matSteel);
    rung.position.set(0.6, -0.4 + i * 0.32, 0);
    intake.add(rung);
  }
  // intake label plate
  const intakePlate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.02), matSteelDark);
  intakePlate.position.set(0, 0.3, 0.56);
  intake.add(intakePlate);

  // duct from silo down into break-roller floor
  const intakeDuct = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), matDuct);
  intakeDuct.position.set(-5.05, -1.1, 0);
  scene.add(intakeDuct);
  // diagonal duct connecting silo to first break-roller (longer span; rollers moved further right)
  const xferDuct = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.5, 14), matDuct);
  xferDuct.position.set(-3.95, -0.4, 0);
  xferDuct.rotation.z = Math.PI / 3;
  scene.add(xferDuct);

  // ============ BREAK-ROLLER STAND (the iconic milling unit) ============
  // Two stands side-by-side, classic Bühler-style cream housings
  const rollerStands = [];
  function makeRollerStand(x, isWarn = false) {
    const g = new THREE.Group();
    g.position.set(x, -0.5, 0);
    scene.add(g);

    // main cream housing (taller in front, sloped top)
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.8), isWarn ? matCreamWarn : matCream);
    housing.position.y = 0.05;
    g.add(housing);
    // sloped top cover
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.1, 1.85), matSteelDark);
    topPlate.position.y = 0.65;
    g.add(topPlate);
    // front control panel (dark recessed area)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.04), matFrame);
    panel.position.set(0, 0.0, 0.92);
    g.add(panel);
    // gauges (3 small cylinders on the panel)
    for (let i = 0; i < 3; i++) {
      const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), matSteel);
      gauge.rotation.x = Math.PI / 2;
      gauge.position.set(-0.3 + i * 0.3, 0.05, 0.94);
      g.add(gauge);
    }
    // brand plate
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.02), matSteelDark);
    plate.position.set(0, -0.28, 0.93);
    g.add(plate);
    // bolts in corners of housing front
    [[-0.65, 0.45], [0.65, 0.45], [-0.65, -0.45], [0.65, -0.45]].forEach(([bx, by]) => {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), matBolt);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx, by, 0.91);
      g.add(bolt);
    });
    // base / pedestal
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.9), matSteelDark);
    ped.position.y = -0.6;
    g.add(ped);
    // 4 feet
    [[-0.65, -0.85], [0.65, -0.85], [-0.65, 0.85], [0.65, 0.85]].forEach(([fx, fz]) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.22), matFrame);
      foot.position.set(fx, -0.75, fz);
      g.add(foot);
    });
    // exposed roller pair on the side (visible cylinders)
    const rollerL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 24), matRoller);
    rollerL.rotation.x = Math.PI / 2;
    rollerL.position.set(-0.22, 0.15, 0);
    g.add(rollerL);
    const rollerR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.4, 24), matRoller);
    rollerR.rotation.x = Math.PI / 2;
    rollerR.position.set(0.22, 0.15, 0);
    g.add(rollerR);
    // viewing window above rollers — glass with an inner glow (cyan = ok, amber = warn)
    const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.04), matGlass);
    window_.position.set(0, 0.3, 0.92);
    g.add(window_);
    const innerGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.21, 0.005),
      new THREE.MeshBasicMaterial({
        color: isWarn ? 0xf59e0b : 0x22d3ee,
        transparent: true,
        opacity: isWarn ? 0.45 : 0.25,
      })
    );
    innerGlow.position.set(0, 0.3, 0.95);
    g.add(innerGlow);
    // top-mount drive motor with belt guard (industrial detail)
    const driveMotor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.5, 18),
      new THREE.MeshStandardMaterial({ color: 0x2c3650, metalness: 0.85, roughness: 0.4 })
    );
    driveMotor.rotation.z = Math.PI / 2;
    driveMotor.position.set(-0.2, 0.95, 0);
    g.add(driveMotor);
    const driveCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 18), matSteelDark);
    driveCap.rotation.z = Math.PI / 2;
    driveCap.position.set(0.07, 0.95, 0);
    g.add(driveCap);
    const beltGuard = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.08), matSteelDark);
    beltGuard.position.set(0.05, 0.55, 0.55);
    g.add(beltGuard);
    // discharge spout below
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), matSteelDark);
    spout.position.y = -0.45;
    g.add(spout);
    rollerStands.push({ group: g, rollerL, rollerR, isWarn, innerGlow });
    return g;
  }
  // Repositioned along the left → right story line.
  makeRollerStand(-2.8, false);
  makeRollerStand(-0.7, true);   // the highlighted one with the issue
  // short transfer chute between the two rollers
  const rollerLink = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.4), matDuct);
  rollerLink.position.set(-1.75, -1.05, 0);
  scene.add(rollerLink);

  // ============ PLANSIFTER (right of the rollers; this is where the story's issue lives) ============
  const sifter = new THREE.Group();
  sifter.position.set(1.6, 0.4, 0);
  scene.add(sifter);
  // outer frame (suspended box)
  const sifterBody = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.8, 1.7),
    new THREE.MeshStandardMaterial({ color: 0xd9cdb4, metalness: 0.3, roughness: 0.6 }));
  sifter.add(sifterBody);
  // horizontal sieve deck lines (multiple decks visible as dark bands)
  for (let i = 0; i < 7; i++) {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.04, 1.72),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.4, roughness: 0.7 }));
    deck.position.y = -0.75 + i * 0.22;
    sifter.add(deck);
  }
  // 4 suspension rods to ceiling-level beam
  const sifterTopBeam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.9), matSteelDark);
  sifterTopBeam.position.y = 1.05;
  sifter.add(sifterTopBeam);
  for (let dx = -1; dx <= 1; dx += 2) {
    for (let dz = -1; dz <= 1; dz += 2) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 10), matSteel);
      rod.position.set(dx * 0.7, 1.55, dz * 0.7);
      sifter.add(rod);
    }
  }
  // motor on top
  const sifterMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 16), matSteelDark);
  sifterMotor.rotation.z = Math.PI / 2;
  sifterMotor.position.set(0, 1.25, 0);
  sifter.add(sifterMotor);
  // outlet ducts at bottom — angled chutes for flour (front-right) and bran (back-right)
  const flourChute = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 14), matDuct);
  flourChute.position.set(0.7, -1.4, 0.55);
  flourChute.rotation.x = -Math.PI / 8;
  flourChute.rotation.z = -Math.PI / 4;
  sifter.add(flourChute);
  const branChute = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.4, 14), matDuct);
  branChute.position.set(0.7, -1.4, -0.55);
  branChute.rotation.x = Math.PI / 8;
  branChute.rotation.z = -Math.PI / 4;
  sifter.add(branChute);

  // ============ FLOUR PILE + BRAN PILE (right end of the line) ============
  const matFlour = new THREE.MeshStandardMaterial({
    color: 0xfff1d6, metalness: 0.05, roughness: 0.9, emissive: 0x2a1a04, emissiveIntensity: 0.06,
  });
  const matBran = new THREE.MeshStandardMaterial({
    color: 0xa8763a, metalness: 0.1, roughness: 0.95,
  });
  const flourPile = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.7, 32), matFlour);
  flourPile.position.set(4.0, -1.25, 1.0);
  scene.add(flourPile);
  const flourPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.04, 32), matSteelDark);
  flourPlate.position.set(4.0, -1.59, 1.0);
  scene.add(flourPlate);
  const branPile = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.6, 32), matBran);
  branPile.position.set(4.0, -1.3, -1.0);
  scene.add(branPile);
  const branPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.04, 32), matSteelDark);
  branPlate.position.set(4.0, -1.59, -1.0);
  scene.add(branPlate);
  // small tag plates in front of the piles (label affordance)
  const tagMat = new THREE.MeshStandardMaterial({
    color: 0x12243a, metalness: 0.4, roughness: 0.5,
    emissive: 0x0c1a2a, emissiveIntensity: 0.4,
  });
  const flourTag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.02), tagMat);
  flourTag.position.set(4.0, -1.5, 1.85);
  scene.add(flourTag);
  const branTag = flourTag.clone();
  branTag.position.set(4.0, -1.5, -1.85);
  scene.add(branTag);

  // ============ HORIZONTAL TRANSFER PIPING (overhead manifolds) ============
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.5, 12), matDuct);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-0.6, 1.8 + i * 0.12, -0.6 + i * 0.4);
    scene.add(pipe);
  }
  // pneumatic lift pipe — straight up from the highlighted roller
  const liftPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 14), matDuct);
  liftPipe.position.set(-0.7, 0.95, 0);
  scene.add(liftPipe);
  const liftElbow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), matDuct);
  liftElbow.position.set(-0.7, 2.2, 0);
  scene.add(liftElbow);
  // horizontal run carrying it across to sifter top
  const liftHoriz = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 14), matDuct);
  liftHoriz.rotation.z = Math.PI / 2;
  liftHoriz.position.set(0.5, 2.2, 0);
  scene.add(liftHoriz);
  // drop-down into the sifter top
  const liftDrop = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.6, 14), matDuct);
  liftDrop.position.set(1.6, 1.9, 0);
  scene.add(liftDrop);

  // ============ WARNING BEACON on the SIFTER (story: extraction is leaking here) ============
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.35, 0.022, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.set(1.6, -1.45, 0);
  scene.add(halo);
  const haloOuter = new THREE.Mesh(
    new THREE.TorusGeometry(1.65, 0.015, 8, 80),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45 })
  );
  haloOuter.rotation.x = Math.PI / 2;
  haloOuter.position.set(1.6, -1.45, 0);
  scene.add(haloOuter);
  // Vertical scanning beam over the issue area — sweeps to draw the eye.
  const scanBeamMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
  });
  const scanBeam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 3.0), scanBeamMat);
  scanBeam.position.set(1.6, 0.2, 0);
  scene.add(scanBeam);
  // Sifter body emissive overlay (breathes with the warning).
  const sifterGlow = new THREE.Mesh(
    new THREE.BoxGeometry(1.74, 1.84, 1.74),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.05 })
  );
  sifter.add(sifterGlow);

  // ============ FLOW PARTICLES ============
  const flowGroups = [];
  function makeFlow(color, count, ptSize, getPath, opacity = 0.9) {
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      phases[i] = Math.random();
      const p = getPath(phases[i], i);
      positions[i*3] = p.x; positions[i*3+1] = p.y; positions[i*3+2] = p.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size: ptSize, transparent: true, opacity, sizeAttenuation: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    flowGroups.push({ points, phases, getPath, count, speed: 0.005 + Math.random()*0.002 });
  }

  // 01 — Wheat: silo → first break roller (diagonal drop along xferDuct)
  makeFlow(0xe8c889, 90, 0.05, (ph, i) => {
    const jx = ((i * 0.137) % 1 - 0.5) * 0.06;
    return {
      x: -5.5 + ph * 2.7,
      y: 0.6 - ph * 1.6,
      z: jx,
    };
  });
  // 02 — Through break rollers (low, left → right)
  makeFlow(0xe8c889, 70, 0.045, (ph, i) => ({
    x: -2.8 + ph * 2.1,
    y: -1.05 + Math.sin(ph * 8) * 0.04,
    z: ((i * 0.211) % 1 - 0.5) * 0.1,
  }));
  // 03 — Pneumatic lift: ground → up → over → into sifter top
  makeFlow(0xe8c889, 60, 0.04, (ph, i) => {
    const jx = ((i * 0.183) % 1 - 0.5) * 0.05;
    if (ph < 0.4) {
      return { x: -0.7 + jx, y: -0.5 + (ph / 0.4) * 2.7, z: jx };
    } else if (ph < 0.85) {
      const p2 = (ph - 0.4) / 0.45;
      return { x: -0.7 + p2 * 2.3, y: 2.2 + jx, z: jx };
    }
    return { x: 1.6 + jx, y: 2.2 - (ph - 0.85) / 0.15 * 0.6, z: jx };
  });
  // 04 — Inside sifter: cascading through decks
  makeFlow(0xe8c889, 50, 0.04, (ph, i) => ({
    x: 1.6 + ((i * 0.31) % 1 - 0.5) * 1.4,
    y: 1.4 - ph * 2.0,
    z: ((i * 0.27) % 1 - 0.5) * 1.4,
  }), 0.7);
  // 05 — Flour output: front chute → flour pile (front-right)
  makeFlow(0xfff4d8, 70, 0.06, (ph, i) => {
    const jx = ((i * 0.19) % 1 - 0.5) * 0.08;
    return {
      x: 2.0 + ph * 2.0,
      y: -0.7 - ph * 0.55,
      z: 0.7 + ph * 0.3 + jx,
    };
  });
  // 06 — Bran output (amber): back chute → bran pile (back-right)
  makeFlow(0xc8954a, 50, 0.05, (ph, i) => {
    const jx = ((i * 0.23) % 1 - 0.5) * 0.08;
    return {
      x: 2.0 + ph * 2.0,
      y: -0.7 - ph * 0.55,
      z: -0.7 - ph * 0.3 + jx,
    };
  });

  // ============ ANIMATE ============
  let t = 0;
  let raf = 0;
  function animate() {
    t += 0.016;

    flowGroups.forEach(g => {
      const arr = g.points.geometry.attributes.position.array;
      for (let i = 0; i < g.count; i++) {
        g.phases[i] += g.speed;
        if (g.phases[i] > 1) g.phases[i] -= 1;
        const p = g.getPath(g.phases[i], i);
        arr[i*3] = p.x; arr[i*3+1] = p.y; arr[i*3+2] = p.z;
      }
      g.points.geometry.attributes.position.needsUpdate = true;
    });

    // spin rollers
    rollerStands.forEach(s => {
      s.rollerL.rotation.y += 0.18;
      s.rollerR.rotation.y -= 0.18;
    });

    // sifter wobble (plansifters use gyratory motion); centered on its new x=1.6
    sifter.position.x = 1.6 + Math.cos(t * 6) * 0.025;
    sifter.position.z = Math.sin(t * 6) * 0.025;

    // Pulsing warning beacon on the sifter — multi-ring + sweeping scan beam.
    const pulse = (Math.sin(t * 3) + 1) / 2;
    halo.material.opacity = 0.45 + pulse * 0.45;
    halo.scale.setScalar(1 + pulse * 0.06);
    haloOuter.material.opacity = 0.25 + Math.sin(t * 1.6 + 1.0) * 0.2;
    haloOuter.scale.setScalar(1 + (Math.sin(t * 1.6) + 1) * 0.04);
    sifterGlow.material.opacity = 0.04 + pulse * 0.06;
    scanBeam.rotation.y = t * 0.6;
    scanBeam.material.opacity = 0.12 + pulse * 0.18;

    // Inspection-window glow on the warn roller breathes alongside.
    rollerStands.forEach((s) => {
      if (s.isWarn && s.innerGlow) {
        s.innerGlow.material.opacity = 0.35 + pulse * 0.35;
      }
    });

    // accent point light pulse
    accent.intensity = 0.45 + Math.sin(t * 1.2) * 0.1;

    // Front-of-line camera with small lateral sway. Composition stays stable so
    // the left → right story line keeps reading.
    camera.position.x = 0.5 + Math.sin(t * 0.18) * 0.25;
    camera.position.y = 3.4 + Math.sin(t * 0.22) * 0.15;
    camera.lookAt(0.5, 0.4, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    renderer.forceContextLoss?.();
    renderer.dispose();
  };
}
