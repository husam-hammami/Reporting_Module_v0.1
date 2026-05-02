/* ===== ATLAS v2 — 3D scenes (Motor + Milling) =====
 * Extracted byte-for-byte from prototypes/hercules_atlas_final.html
 * (the merged Claude Design source). Do NOT simplify or reimagine —
 * geometries, materials, colors, lighting and animations must match
 * the approved design exactly.
 */

import * as THREE from 'three';

/* ============ 3D MOTOR SCENE — M31 grinding section ============ */
export function initMotorScene(canvas) {
  if (!canvas) return () => {};

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(2.6, 1.6, 3.2);
  camera.lookAt(0, 0, 0);

  function size() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(r.height, 1);
    camera.updateProjectionMatrix();
  }
  size();
  window.addEventListener('resize', size);

  // Lights
  scene.add(new THREE.AmbientLight(0x88bbdd, 0.4));
  const key = new THREE.DirectionalLight(0x7df9ff, 1.4);
  key.position.set(3, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfbbf24, 0.8);
  rim.position.set(-3, 1, -2);
  scene.add(rim);
  const front = new THREE.PointLight(0x22d3ee, 0.7, 8);
  front.position.set(0, 0.5, 3);
  scene.add(front);

  const motor = new THREE.Group();

  // Main body (motor frame) - cylinder with ridges
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2a3040, metalness: 0.85, roughness: 0.4, emissive: 0x0a1422, emissiveIntensity: 0.4
  });
  const bodyGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.6, 48);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.rotation.z = Math.PI / 2;
  motor.add(body);

  // Cooling ridges
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: 0x3a4258, metalness: 0.9, roughness: 0.3
  });
  for (let i = 0; i < 12; i++) {
    const rGeo = new THREE.TorusGeometry(0.72, 0.02, 6, 36);
    const ring = new THREE.Mesh(rGeo, ridgeMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -0.7 + (i / 11) * 1.4;
    motor.add(ring);
  }

  // End caps
  const capGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.18, 36);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x1a2030, metalness: 0.7, roughness: 0.5
  });
  const cap1 = new THREE.Mesh(capGeo, capMat);
  cap1.rotation.z = Math.PI / 2;
  cap1.position.x = 0.85;
  motor.add(cap1);
  const cap2 = cap1.clone();
  cap2.position.x = -0.85;
  motor.add(cap2);

  // Junction box (top)
  const jbGeo = new THREE.BoxGeometry(0.42, 0.28, 0.42);
  const jbMat = new THREE.MeshStandardMaterial({
    color: 0x1e2638, metalness: 0.6, roughness: 0.5
  });
  const jb = new THREE.Mesh(jbGeo, jbMat);
  jb.position.set(0, 0.82, 0);
  motor.add(jb);

  // Mounting feet
  const footGeo = new THREE.BoxGeometry(0.35, 0.12, 0.5);
  const footMat = new THREE.MeshStandardMaterial({
    color: 0x161c2a, metalness: 0.6, roughness: 0.6
  });
  const f1 = new THREE.Mesh(footGeo, footMat);
  f1.position.set(0.5, -0.78, 0);
  motor.add(f1);
  const f2 = f1.clone();
  f2.position.x = -0.5;
  motor.add(f2);

  // Output shaft
  const shaftGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.55, 24);
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0x6a7080, metalness: 0.95, roughness: 0.2
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 1.2;
  motor.add(shaft);

  // Coupling on shaft
  const coupGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 24);
  const coupling = new THREE.Mesh(coupGeo, new THREE.MeshStandardMaterial({
    color: 0xf59e0b, metalness: 0.7, roughness: 0.4, emissive: 0x331400, emissiveIntensity: 0.5
  }));
  coupling.rotation.z = Math.PI / 2;
  coupling.position.x = 1.42;
  motor.add(coupling);

  // Spinning indicator (fan grille on back)
  const fanGroup = new THREE.Group();
  const fanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.04, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0x556070, metalness: 0.7, roughness: 0.4 })
  );
  fanRing.rotation.y = Math.PI / 2;
  fanGroup.add(fanRing);
  for (let i = 0; i < 6; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.45, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.6, roughness: 0.5 })
    );
    const a = (i / 6) * Math.PI * 2;
    blade.position.set(0, Math.cos(a) * 0.25, Math.sin(a) * 0.25);
    blade.rotation.x = a;
    fanGroup.add(blade);
  }
  fanGroup.position.x = -0.95;
  motor.add(fanGroup);

  // Holographic warning ring around the body (anomaly visualization)
  const haloGeo = new THREE.TorusGeometry(0.85, 0.012, 6, 80);
  const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
    color: 0xf59e0b, transparent: true, opacity: 0.7
  }));
  halo.rotation.y = Math.PI / 2;
  halo.position.x = 0;
  motor.add(halo);

  // ID label nameplate
  const plateGeo = new THREE.PlaneGeometry(0.32, 0.16);
  const plateMat = new THREE.MeshBasicMaterial({ color: 0x081420, transparent: true, opacity: 0.7 });
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.set(0, 0.05, 0.71);
  motor.add(plate);

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
    fanGroup.rotation.x += 0.18; // continuous fan rotation
    coupling.rotation.x += 0.18;
    motor.rotation.y = -0.3 + Math.sin(t * 0.3) * 0.18 + userSpin;
    motor.rotation.x = Math.sin(t * 0.4) * 0.05;

    // halo pulses with vibration warning
    const pulse = (Math.sin(t * 4) + 1) / 2;
    halo.material.opacity = 0.4 + pulse * 0.5;
    halo.scale.setScalar(1 + pulse * 0.04);

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
    renderer.dispose();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
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
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  camera.position.set(8.6, 4.4, 11.0);
  camera.lookAt(0, 0.3, 0);

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

  // ============ FLOOR + GRID ============
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 14), matFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.6;
  scene.add(floor);
  const grid = new THREE.GridHelper(22, 22, 0x22d3ee, 0x0e1628);
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
  // Four vertical columns
  const colXs = [-3.6, -1.0, 1.6, 4.2];
  const colZs = [-1.1, 1.1];
  colXs.forEach(cx => colZs.forEach(cz => beam(cx, 0.2, cz, 0.18, 3.4, 0.18)));
  // horizontal floor beams (cross-bracing) at three levels
  [-1.4, 0.0, 1.6].forEach(y => {
    // long beams along X
    colZs.forEach(cz => beam(0.3, y, cz, 8.2, 0.1, 0.12));
    // short beams along Z
    colXs.forEach(cx => beam(cx, y, 0, 0.12, 0.1, 2.4));
  });
  // catwalk grating at mid-level (front side)
  const catwalk = new THREE.Mesh(
    new THREE.BoxGeometry(8.4, 0.05, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x2a3344, metalness: 0.7, roughness: 0.6 })
  );
  catwalk.position.set(0.3, 0.05, 1.5);
  scene.add(catwalk);
  // catwalk rails
  for (let i = 0; i < 2; i++) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.04, 0.04), matSteel);
    rail.position.set(0.3, 0.4 + i * 0.3, 1.78);
    scene.add(rail);
  }

  // ============ INTAKE TOWER (left, tall hopper feeding the line) ============
  const intake = new THREE.Group();
  intake.position.set(-4.4, 0, 0);
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
  intakeDuct.position.set(-3.95, -1.1, 0);
  scene.add(intakeDuct);
  // diagonal duct connecting silo to break rolls
  const xferDuct = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 14), matDuct);
  xferDuct.position.set(-3.45, -0.9, 0);
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
    // viewing window above rollers
    const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.04), matGlass);
    window_.position.set(0, 0.3, 0.92);
    g.add(window_);
    // discharge spout below
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), matSteelDark);
    spout.position.y = -0.45;
    g.add(spout);
    rollerStands.push({ group: g, rollerL, rollerR, isWarn });
    return g;
  }
  makeRollerStand(-2.0, false);
  makeRollerStand(-0.2, true);   // the highlighted one with the issue

  // ============ PLANSIFTER (tall cubic sifter on right side) ============
  const sifter = new THREE.Group();
  sifter.position.set(2.4, 0.4, 0);
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
  // outlet ducts at bottom — angled chutes for flour and bran
  const flourChute = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 14), matDuct);
  flourChute.position.set(-0.5, -1.1, 0.4);
  flourChute.rotation.x = -Math.PI / 6;
  flourChute.rotation.z = Math.PI / 5;
  sifter.add(flourChute);
  const branChute = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.7, 14), matDuct);
  branChute.position.set(0.55, -1.05, -0.4);
  branChute.rotation.x = Math.PI / 6;
  branChute.rotation.z = -Math.PI / 5;
  sifter.add(branChute);

  // ============ HORIZONTAL TRANSFER PIPING (overhead manifolds) ============
  // Run between rollers and sifter at high level
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 12), matDuct);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0.5, 1.8 + i * 0.12, -0.6 + i * 0.4);
    scene.add(pipe);
  }
  // pneumatic-lift pipe rising from highlighted roller up to sifter top
  const liftPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 14), matDuct);
  liftPipe.position.set(-0.2, 0.95, 0);
  scene.add(liftPipe);
  // elbow
  const liftElbow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), matDuct);
  liftElbow.position.set(-0.2, 2.2, 0);
  scene.add(liftElbow);
  // horizontal run to sifter
  const liftHoriz = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.7, 14), matDuct);
  liftHoriz.rotation.z = Math.PI / 2;
  liftHoriz.position.set(1.15, 2.2, 0);
  scene.add(liftHoriz);

  // ============ WARNING HALO on the issue roller ============
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.018, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 })
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.set(-0.2, -0.95, 0);
  scene.add(halo);

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

  // Wheat: silo → break roller 1 (diagonal drop)
  makeFlow(0xe8c889, 90, 0.05, (ph, i) => {
    const jx = (i * 0.137) % 1 - 0.5;
    return {
      x: -4.4 + ph * 2.4,
      y: 0.6 - ph * 1.7,
      z: jx * 0.08
    };
  });
  // Through break rollers: -2.0 to -0.2 (horizontal at low level)
  makeFlow(0xe8c889, 70, 0.045, (ph, i) => ({
    x: -2.0 + ph * 1.8,
    y: -1.0 + Math.sin(ph * 8) * 0.04,
    z: ((i * 0.211) % 1 - 0.5) * 0.1
  }));
  // Pneumatic lift: from highlighted roller UP and OVER to sifter top
  makeFlow(0xe8c889, 60, 0.04, (ph, i) => {
    const jx = ((i * 0.183) % 1 - 0.5) * 0.05;
    if (ph < 0.45) {
      return { x: -0.2 + jx, y: -0.5 + (ph / 0.45) * 2.7, z: jx };
    } else if (ph < 0.95) {
      const p2 = (ph - 0.45) / 0.5;
      return { x: -0.2 + p2 * 2.6, y: 2.2 + jx, z: jx };
    } else {
      return { x: 2.4, y: 2.2 - (ph - 0.95) * 4 * 0.6, z: jx };
    }
  });
  // Inside sifter — particles cascading through decks
  makeFlow(0xe8c889, 50, 0.04, (ph, i) => ({
    x: 2.4 + ((i*0.31)%1 - 0.5) * 1.4,
    y: 1.4 - ph * 2.0,
    z: ((i*0.27)%1 - 0.5) * 1.4
  }), 0.7);
  // Flour output (cream, brighter): out of sifter flour chute, to right
  makeFlow(0xfff4d8, 70, 0.06, (ph, i) => ({
    x: 1.9 - ph * 0.0 + ph * (-0.5),
    y: -0.6 - ph * 0.6,
    z: 0.8 + ph * 1.2
  }));
  // simpler flour chute path
  makeFlow(0xfff4d8, 50, 0.055, (ph, i) => ({
    x: 1.9 + ph * 0.6,
    y: -0.7 - ph * 0.7,
    z: 0.85 + ((i*0.19)%1 - 0.5)*0.1
  }));
  // Bran output (amber): out of sifter bran chute, to right-back
  makeFlow(0xc8954a, 35, 0.05, (ph, i) => ({
    x: 2.95 + ph * 0.4,
    y: -0.65 - ph * 0.65,
    z: -0.85 - ((i*0.23)%1) * 0.3
  }));

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

    // sifter wobble (plansifters use gyratory motion)
    sifter.position.x = 2.4 + Math.cos(t * 6) * 0.025;
    sifter.position.z = Math.sin(t * 6) * 0.025;

    // pulsing warning halo
    const pulse = (Math.sin(t * 3) + 1) / 2;
    halo.material.opacity = 0.45 + pulse * 0.45;
    halo.scale.setScalar(1 + pulse * 0.06);

    // accent point light pulse
    accent.intensity = 0.45 + Math.sin(t * 1.2) * 0.1;

    // gentle camera sway
    camera.position.x = 8.6 + Math.sin(t * 0.18) * 0.35;
    camera.position.y = 4.4 + Math.sin(t * 0.22) * 0.2;
    camera.lookAt(0, 0.3, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(animate);
  }
  animate();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    renderer.dispose();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
  };
}
