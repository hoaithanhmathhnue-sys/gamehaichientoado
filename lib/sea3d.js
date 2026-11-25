/* sea3d.js — Engine 3D Three.js tích hợp trực tiếp vào Hải Chiến Tọa Độ (chạy 100% offline) */
(function (global) {
  "use strict";

  const CAM_MODES = ["🎥 3D Chiến thuật", "🔭 Toàn cảnh", "🧭 Nhìn từ trên (Oxy)"];
  const CELL = 1.65;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  let H = null; // hooks từ index.html
  let active = false;
  let rafId = 0;
  let dirty = true;

  const W3 = {
    ready: false, failed: false,
    scene: null, camera: null, renderer: null, clock: null, container: null,
    ocean: null, oceanBaseY: null, partGeo: null, clouds: [], islands: [],
    arenaGroup: null, boardViews: [], flagships: [],
    cursorGroup: null, cursorRing: null, cursorBeam: null, cursorProjX: null, cursorProjY: null, cursorLabel: null, cursorRadarBox: null,
    fxGroup: null, particles: [], rings: [], projectiles: [], floaters: [], fires: [],
    raycaster: null, hitPlane: null,
    camMode: 0,
    camTarget: null, camGoalTarget: null,
    camSph: { r: 24, theta: 0, phi: 0.85 }, camGoalSph: { r: 24, theta: 0, phi: 0.85 },
    userOrbitOffset: { theta: 0, phi: 0, rScale: 1 },
    shakeMag: 0, shakeTime: 0,
    texCache: new Map(),
    pirateSailTex: null
  };

  function teamMode() { return H.getState().teams.length > 1; }
  function targetOf(shooter) {
    const G = H.getState();
    return teamMode() ? G.boards[1 - shooter] : G.boards[0];
  }
  function boardCenterX(bi) {
    if (!teamMode()) return 0;
    const n = H.getState().boards[0].n;
    const halfSpan = (n + 2.1) * CELL;
    return bi === 0 ? -halfSpan : halfSpan;
  }
  function cellWorldPos(bi, x, y, yHeight = 0.18) {
    return new THREE.Vector3(boardCenterX(bi) + x * CELL, yHeight, -y * CELL);
  }

  function makeTextSprite(text, { color = "#e0f2fe", bg = "", border = "", font = "900 44px Segoe UI, Arial, sans-serif", stroke = "#082f49", scale = 1.05 } = {}) {
    const key = text + "|" + color + "|" + bg + "|" + border + "|" + font;
    let tex = W3.texCache.get(key);
    if (!tex) {
      const cv = document.createElement("canvas");
      const ctx = cv.getContext("2d");
      ctx.font = font;
      const m = ctx.measureText(text);
      const padX = bg ? 28 : 16;
      const w = Math.max(64, Math.ceil(m.width + padX * 2));
      const h = bg ? 76 : 68;
      cv.width = w; cv.height = h;
      ctx.font = font;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      if (bg) {
        const r = 18;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(r, 3); ctx.lineTo(w - r, 3); ctx.quadraticCurveTo(w - 3, 3, w - 3, r);
        ctx.lineTo(w - 3, h - r); ctx.quadraticCurveTo(w - 3, h - 3, w - r, h - 3);
        ctx.lineTo(r, h - 3); ctx.quadraticCurveTo(3, h - 3, 3, h - r);
        ctx.lineTo(3, r); ctx.quadraticCurveTo(3, 3, r, 3); ctx.closePath();
        ctx.fill();
        if (border) { ctx.strokeStyle = border; ctx.lineWidth = 5; ctx.stroke(); }
      }
      if (stroke && !bg) {
        ctx.lineWidth = 10; ctx.strokeStyle = stroke; ctx.lineJoin = "round";
        ctx.strokeText(text, w / 2, h / 2 + 2);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, w / 2, h / 2 + 2);
      tex = new THREE.CanvasTexture(cv);
      tex.minFilter = THREE.LinearFilter;
      tex.userData = { aspect: w / h };
      W3.texCache.set(key, tex);
    }
    const aspect = tex.userData.aspect || 1;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(scale * aspect, scale, 1);
    sp.renderOrder = 20;
    return sp;
  }

  function getPirateSailTexture() {
    if (W3.pirateSailTex) return W3.pirateSailTex;
    const cv = document.createElement("canvas");
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#475569"; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 240, 240);
    ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 18; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(58, 175); ctx.lineTo(198, 118); ctx.moveTo(198, 175); ctx.lineTo(58, 118); ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath(); ctx.arc(128, 102, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(102, 130, 52, 26);
    ctx.fillStyle = "#111827";
    ctx.beginPath(); ctx.arc(110, 102, 12, 0, Math.PI * 2); ctx.arc(146, 102, 12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(128, 116); ctx.lineTo(120, 130); ctx.lineTo(136, 130); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#111827"; ctx.lineWidth = 4;
    [116, 128, 140].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x, 156); ctx.stroke(); });
    W3.pirateSailTex = new THREE.CanvasTexture(cv);
    return W3.pirateSailTex;
  }

  function buildEnvironment(scene) {
    const islandDefs = [
      { x: -34, z: -26, s: 1.5, lh: true },
      { x: 36, z: -24, s: 1.35, lh: false },
      { x: -38, z: 18, s: 1.1, lh: false },
      { x: 40, z: 16, s: 1.25, lh: false },
      { x: 0, z: -38, s: 1.8, lh: false }
    ];
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.85, flatShading: true });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8, flatShading: true });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75, flatShading: true });

    for (const d of islandDefs) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 7), sandMat);
      base.position.y = 0.25; g.add(base);
      const hill = new THREE.Mesh(new THREE.ConeGeometry(2.8, 2.3, 6), grassMat);
      hill.position.set(0.3, 1.2, -0.2); g.add(hill);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), rockMat);
      rock.position.set(-1.5, 0.8, 0.8); g.add(rock);
      for (let p = 0; p < 2; p++) {
        const palm = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 2.4, 5), trunkMat);
        trunk.position.y = 1.2; trunk.rotation.z = p ? -0.18 : 0.16; palm.add(trunk);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.9, 6), leafMat);
        crown.position.set(p ? 0.22 : -0.2, 2.45, 0); palm.add(crown);
        palm.position.set(p ? 1.1 : -0.6, 1.2, p ? 0.5 : -0.7);
        g.add(palm);
      }
      if (d.lh) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 3.6, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 }));
        tower.position.set(0.2, 3.2, -0.2); g.add(tower);
        const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.6, 1.0, 8), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 }));
        stripe.position.set(0.2, 3.2, -0.2); g.add(stripe);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        lamp.position.set(0.2, 5.15, -0.2); g.add(lamp);
      }
      g.position.set(d.x, -0.2, d.z);
      g.scale.setScalar(d.s);
      scene.add(g);
      W3.islands.push(g);
    }

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.88, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.4, 2.6), 1), cloudMat);
        puff.position.set((j - 1.5) * 1.6, rand(-0.3, 0.6), rand(-0.8, 0.8));
        c.add(puff);
      }
      c.position.set(rand(-55, 55), rand(18, 28), rand(-55, -18));
      c.userData.speed = rand(0.35, 0.85);
      scene.add(c);
      W3.clouds.push(c);
    }
  }

  function buildShip3D(len, teamHex, { flagship = false, sunk = false, ghost = false } = {}) {
    const g = new THREE.Group();
    const hullLen = flagship ? 4.4 : (len - 0.15) * CELL;
    const hullW = flagship ? 1.55 : 0.96;
    const hullH = flagship ? 0.72 : 0.52;

    const hullMat = ghost
      ? new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xf59e0b, emissiveIntensity: 0.45, transparent: true, opacity: 0.48, roughness: 0.3 })
      : new THREE.MeshStandardMaterial({ color: sunk ? 0x334155 : (flagship ? 0x1e293b : 0x475569), roughness: 0.5, metalness: 0.25 });
    const deckMat = ghost ? hullMat : new THREE.MeshStandardMaterial({ color: sunk ? 0x1e293b : 0x94a3b8, roughness: 0.65 });
    const accentMat = ghost
      ? new THREE.MeshBasicMaterial({ color: 0xfef08a })
      : new THREE.MeshStandardMaterial({ color: teamHex, emissive: teamHex, emissiveIntensity: sunk ? 0.05 : 0.25, roughness: 0.4 });

    const midLen = hullLen * 0.74;
    const body = new THREE.Mesh(new THREE.BoxGeometry(midLen, hullH, hullW), hullMat);
    body.position.y = hullH * 0.45; body.castShadow = !ghost; body.receiveShadow = true;
    g.add(body);

    const bowGeo = new THREE.ConeGeometry(hullW * 0.68, hullLen * 0.32, 4);
    bowGeo.rotateZ(-Math.PI / 2); bowGeo.rotateX(Math.PI / 4);
    const bow = new THREE.Mesh(bowGeo, hullMat);
    bow.position.set(midLen * 0.5 + hullLen * 0.15, hullH * 0.45, 0);
    bow.scale.set(1, hullH / (hullW * 0.95), 1);
    bow.castShadow = !ghost;
    g.add(bow);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(midLen * 0.96, hullH * 0.24, hullW + 0.05), accentMat);
    stripe.position.y = hullH * 0.62;
    g.add(stripe);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(midLen * 0.92, 0.1, hullW * 0.86), deckMat);
    deck.position.y = hullH * 0.93;
    g.add(deck);

    const bridgeH = flagship ? 0.95 : (len >= 4 ? 0.75 : 0.58);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(hullLen * 0.22, bridgeH, hullW * 0.66), deckMat);
    bridge.position.set(-hullLen * 0.08, hullH + bridgeH * 0.45, 0);
    bridge.castShadow = !ghost;
    g.add(bridge);

    const cabinBand = new THREE.Mesh(new THREE.BoxGeometry(hullLen * 0.23, bridgeH * 0.22, hullW * 0.69), new THREE.MeshBasicMaterial({ color: ghost ? 0xfef08a : 0x38bdf8 }));
    cabinBand.position.set(-hullLen * 0.08, hullH + bridgeH * 0.72, 0);
    g.add(cabinBand);

    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.65, 8), accentMat);
    funnel.position.set(-hullLen * 0.25, hullH + 0.42, 0);
    g.add(funnel);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.05, 6), deckMat);
    mast.position.set(-hullLen * 0.08, hullH + bridgeH + 0.5, 0);
    g.add(mast);

    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.04), accentMat);
    flag.position.set(-hullLen * 0.08 - 0.26, hullH + bridgeH + 0.84, 0);
    g.add(flag);

    const turret = new THREE.Group();
    const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.32, 10), accentMat);
    turret.add(tBase);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 });
    [-0.1, 0.1].forEach(zOff => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, flagship ? 1.15 : 0.72, 8), barrelMat);
      b.rotation.z = -Math.PI / 2 + 0.22;
      b.position.set(flagship ? 0.52 : 0.34, 0.12, zOff);
      turret.add(b);
    });
    turret.position.set(hullLen * 0.24, hullH + 0.14, 0);
    g.add(turret);
    g.userData.turret = turret;

    if (len >= 4 && !flagship) {
      const t2 = turret.clone();
      t2.position.set(-hullLen * 0.34, hullH + 0.14, 0);
      t2.rotation.y = Math.PI;
      g.add(t2);
    }
    if (sunk) {
      g.rotation.z = 0.24;
      g.rotation.x = 0.14;
      g.position.y = -0.18;
    }
    return g;
  }

  function buildSpecial3D(kind, { revealedOnly = false } = {}) {
    const g = new THREE.Group();
    const alpha = revealedOnly ? 0.62 : 1;
    const tr = revealedOnly;

    if (kind === "gift") {
      const wood = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.55, transparent: tr, opacity: alpha });
      const gold = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xd97706, emissiveIntensity: 0.45, metalness: 0.65, roughness: 0.25, transparent: tr, opacity: alpha });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.68), wood);
      box.position.y = 0.34; box.castShadow = !tr; g.add(box);
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 0.72), gold);
      band.position.y = 0.52; g.add(band);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.24, 0.68), wood);
      lid.position.set(0, 0.74, -0.22); lid.rotation.x = -0.58; g.add(lid);
      const coins = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: tr, opacity: alpha }));
      coins.scale.set(1.25, 0.55, 0.9); coins.position.y = 0.62; g.add(coins);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: revealedOnly ? 0.5 : 0.9 }));
      halo.rotation.x = Math.PI / 2; halo.position.y = 0.12; g.add(halo);
      if (!revealedOnly) {
        const lbl = makeTextSprite("🎁 +1", { color: "#fef08a", bg: "rgba(20,83,45,.88)", border: "#fde047", font: "900 36px Segoe UI, Arial", scale: 0.75 });
        lbl.position.y = 1.48; g.add(lbl);
      }
    } else if (kind === "beacon") {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.36, 12), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4, transparent: tr, opacity: alpha }));
      base.position.y = 0.22; g.add(base);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.95, 8), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, transparent: tr, opacity: alpha }));
      pole.position.y = 0.75; g.add(pole);
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x16a34a, emissiveIntensity: 0.6, transparent: tr, opacity: alpha }));
      dish.rotation.z = Math.PI / 3; dish.position.y = 1.18; g.add(dish);
      g.userData.spinPart = dish;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 24), new THREE.MeshBasicMaterial({ color: 0x4ade80, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; g.add(ring);
    } else if (kind === "pirate") {
      const darkWood = new THREE.MeshStandardMaterial({ color: 0x3b1d0a, roughness: 0.75, transparent: tr, opacity: alpha });
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.44, 0.64), darkWood);
      hull.position.y = 0.25; hull.castShadow = !tr; g.add(hull);
      const bow = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.48, 4), darkWood);
      bow.rotation.z = -Math.PI / 2; bow.rotation.x = Math.PI / 4; bow.position.set(0.78, 0.28, 0); g.add(bow);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.65, 6), darkWood);
      mast.position.y = 1.04; g.add(mast);
      const sailMat = new THREE.MeshStandardMaterial({ map: getPirateSailTexture(), side: THREE.DoubleSide, roughness: 0.65, transparent: tr, opacity: alpha });
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.96), sailMat);
      sail.position.set(0.02, 1.08, 0.14); g.add(sail);
      const pennant = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 3), new THREE.MeshBasicMaterial({ color: 0xe11d48, transparent: tr, opacity: alpha }));
      pennant.rotation.z = -Math.PI / 2; pennant.position.set(0.22, 1.76, 0); g.add(pennant);
      const aura = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.065, 8, 24), new THREE.MeshBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: revealedOnly ? 0.5 : 0.9 }));
      aura.rotation.x = Math.PI / 2; aura.position.y = 0.12; g.add(aura);
      g.rotation.y = 0.16;
      if (!revealedOnly) {
        const lbl = makeTextSprite("🏴‍☠️ −1", { color: "#fecdd3", bg: "rgba(88,28,135,.9)", border: "#fb7185", font: "900 36px Segoe UI, Arial", scale: 0.75 });
        lbl.position.y = 2.18; g.add(lbl);
      }
    } else if (kind === "mine") {
      const iron = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.65, roughness: 0.35, transparent: tr, opacity: alpha });
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.7, transparent: tr, opacity: alpha });
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), iron);
      sphere.position.y = 0.45; sphere.castShadow = !tr; g.add(sphere);
      const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,0,1],[0,0,-1],[0.7,0.7,0],[-0.7,0.7,0],[0,0.7,0.7],[0,0.7,-0.7]];
      for (const [dx, dy, dz] of dirs) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 6), spikeMat);
        sp.position.set(dx * 0.48, 0.45 + dy * 0.48, dz * 0.48);
        sp.lookAt(dx * 2, 0.45 + dy * 2, dz * 2);
        sp.rotateX(Math.PI / 2);
        g.add(sp);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.06, 8, 24), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: revealedOnly ? 0.5 : 0.9 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.12; g.add(ring);
      if (!revealedOnly) {
        const lbl = makeTextSprite("💣 BẪY", { color: "#fed7aa", bg: "rgba(153,27,27,.9)", border: "#fb923c", font: "900 34px Segoe UI, Arial", scale: 0.72 });
        lbl.position.y = 1.42; g.add(lbl);
      }
    }
    return g;
  }

  function buildHitFire3D() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.56, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0xdc2626, emissiveIntensity: 0.6 }));
    base.position.y = 0.18; g.add(base);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.05, 8), new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.88 }));
    outer.position.y = 0.7; g.add(outer);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 7), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    core.position.y = 0.58; g.add(core);
    g.userData = { outer, core, phase: rand(0, 6.28) };
    W3.fires.push(g);
    return g;
  }

  function buildMissBuoy3D() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.065, 8, 20), new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.82 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.18; g.add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7dd3fc, emissiveIntensity: 0.35 }));
    dot.position.y = 0.2; g.add(dot);
    return g;
  }

  function buildCursor3D() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.075, 10, 28), new THREE.MeshBasicMaterial({ color: 0xfde047 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.26;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.38, 2.2, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.24, side: THREE.DoubleSide }));
    beam.position.y = 1.35;
    g.add(beam);

    const lineMat = new THREE.LineBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.9 });
    const projX = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
    const projY = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat);
    g.add(projX); g.add(projY);

    const radarBox = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL * 3, CELL * 3),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    radarBox.rotation.x = -Math.PI / 2; radarBox.position.y = 0.22;
    const rEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(CELL * 3, CELL * 3)), new THREE.LineBasicMaterial({ color: 0x4ade80 }));
    radarBox.add(rEdge);
    radarBox.visible = false;
    g.add(radarBox);

    g.visible = false;
    W3.scene.add(g);
    W3.cursorGroup = g; W3.cursorRing = ring; W3.cursorBeam = beam;
    W3.cursorProjX = projX; W3.cursorProjY = projY; W3.cursorRadarBox = radarBox;
  }

  function clearGroup(grp) {
    while (grp.children.length) grp.remove(grp.children[0]);
  }

  function raycastCell(clientX, clientY) {
    const G = H.getState();
    if (!W3.ready || G.phase !== "aim") return null;
    const rect = W3.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    W3.raycaster.setFromCamera(ndc, W3.camera);
    const hit = new THREE.Vector3();
    if (!W3.raycaster.ray.intersectPlane(W3.hitPlane, hit)) return null;
    const b = targetOf(G.shooter), bi = G.boards.indexOf(b);
    const cx = boardCenterX(bi);
    const gx = Math.round((hit.x - cx) / CELL);
    const gy = Math.round(-hit.z / CELL);
    if (Math.abs(gx) <= b.n && Math.abs(gy) <= b.n) return { x: gx, y: gy };
    return null;
  }

  function bindControls(el) {
    let dragging = false, moved = 0, lx = 0, ly = 0;
    el.addEventListener("pointerdown", e => {
      if (!active || (e.button !== 0 && e.button !== 2)) return;
      dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener("pointermove", e => {
      if (!active) return;
      if (dragging) {
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        moved += Math.hypot(dx, dy);
        if (moved > 6) {
          el.classList.add("dragging");
          W3.userOrbitOffset.theta = Math.max(-1.05, Math.min(1.05, W3.userOrbitOffset.theta - dx * 0.0045));
          W3.userOrbitOffset.phi = Math.max(-0.55, Math.min(0.5, W3.userOrbitOffset.phi - dy * 0.0045));
          updateCameraGoal(false);
        }
        return;
      }
      if (H.getState().phase === "aim") {
        const ae = document.activeElement;
        if (ae && (ae.id === "inX" || ae.id === "inY")) return;
        const cell = raycastCell(e.clientX, e.clientY);
        if (cell) H.onHoverCell(cell.x, cell.y);
      }
    });
    const endDrag = e => {
      if (!dragging) return;
      const wasClick = moved <= 6 && e.button === 0;
      dragging = false; el.classList.remove("dragging");
      if (wasClick && active && H.getState().phase === "aim") {
        const cell = raycastCell(e.clientX, e.clientY);
        if (cell) H.onClickCell(cell.x, cell.y);
      }
    };
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", () => { dragging = false; el.classList.remove("dragging"); });
    el.addEventListener("contextmenu", e => e.preventDefault());
    el.addEventListener("wheel", e => {
      if (!active) return;
      e.preventDefault();
      W3.userOrbitOffset.rScale = Math.max(0.65, Math.min(1.65, W3.userOrbitOffset.rScale + Math.sign(e.deltaY) * 0.08));
      updateCameraGoal(false);
    }, { passive: false });
  }

  function updateCameraGoal(immediate) {
    if (!W3.ready) return;
    const G = H.getState();
    if (!G.boards.length) return;
    const n = G.boards[0].n;
    const baseR = (n === 3 ? 18 : n === 4 ? 22.5 : 27);
    let tx = 0, tz = 1.2, r = baseR, phi = 0.85, theta = 0;

    if (W3.camMode === 2) {
      phi = 0.22;
      if (teamMode() && G.phase === "aim") {
        tx = boardCenterX(G.boards.indexOf(targetOf(G.shooter)));
        tz = 0.4; r = baseR * 1.05;
      } else if (teamMode()) {
        tx = 0; tz = 0.4; r = baseR * 1.75;
      } else {
        tx = 0; tz = 0.4; r = baseR * 1.02;
      }
    } else if (W3.camMode === 1) {
      phi = 0.86; tx = 0; tz = 1.2;
      r = teamMode() ? baseR * 1.82 : baseR * 1.2;
    } else {
      phi = 0.86;
      if (teamMode() && (G.phase === "aim" || G.phase === "firing" || G.phase === "aimdone")) {
        const bi = G.boards.indexOf(targetOf(G.shooter));
        tx = boardCenterX(bi); tz = 0.7; r = baseR * 1.08;
        theta = bi === 0 ? -0.15 : 0.15;
      } else if (teamMode()) {
        tx = 0; tz = 1.3; r = baseR * 1.78; theta = 0;
      } else {
        tx = 0; tz = 1.0; r = baseR * 1.08; theta = 0;
      }
    }

    W3.camGoalTarget.set(tx, 0, tz);
    W3.camGoalSph = {
      r: Math.max(10, Math.min(62, r * W3.userOrbitOffset.rScale)),
      theta: theta + W3.userOrbitOffset.theta,
      phi: Math.max(0.14, Math.min(1.22, phi + W3.userOrbitOffset.phi))
    };
    if (immediate) {
      W3.camTarget.copy(W3.camGoalTarget);
      W3.camSph = { ...W3.camGoalSph };
    }
  }

  function spawnBurst3D(pos, { n = 36, colors = [0xfde047, 0xf97316, 0xef4444], speed = 8, up = 6, grav = 16, size = 0.24, life = 0.9 } = {}) {
    if (!W3.ready) return;
    const geo = W3.partGeo;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: pick(colors), transparent: true, opacity: 1 });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.scale.setScalar(size);
      const ang = rand(0, Math.PI * 2), spd = rand(speed * 0.25, speed);
      m.userData = {
        vx: Math.cos(ang) * spd, vy: rand(up * 0.4, up * 1.35), vz: Math.sin(ang) * spd,
        grav, life: rand(life * 0.65, life * 1.2), age: 0, spin: rand(-6, 6), baseSize: size
      };
      W3.fxGroup.add(m);
      W3.particles.push(m);
    }
  }

  function spawnRing3D(pos, { color = 0xe0f2fe, maxScale = 4.5, life = 0.8 } = {}) {
    if (!W3.ready) return;
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 28),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.22, pos.z);
    m.userData = { maxScale, life, age: 0 };
    W3.fxGroup.add(m);
    W3.rings.push(m);
  }

  function triggerShake(mag = 0.45, dur = 0.42) {
    W3.shakeMag = Math.max(W3.shakeMag, mag);
    W3.shakeTime = Math.max(W3.shakeTime, dur);
  }

  function loop() {
    if (!active || !W3.ready) { rafId = 0; return; }
    rafId = requestAnimationFrame(loop);
    if (H.isSplashOpen()) return;
    const dt = Math.min(0.05, W3.clock.getDelta());
    if (global.QB && global.QB.editorOpen()) return;
    const t = W3.clock.elapsedTime;
    const G = H.getState();

    if (W3.ocean && G.phase !== "question") {
      const pos = W3.ocean.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        pos.setY(i, W3.oceanBaseY[i] + Math.sin(x * 0.16 + t * 1.45) * 0.16 + Math.cos(z * 0.19 + t * 1.15) * 0.14);
      }
      pos.needsUpdate = true;
    }

    for (const c of W3.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 64) c.position.x = -64;
    }

    for (const f of W3.floaters) {
      f.obj.position.y = f.baseY + Math.sin(t * f.speed + f.phase) * f.amp;
      if (f.rock) f.obj.rotation.z = Math.sin(t * 1.2 + f.phase) * 0.04;
      if (f.spin) f.spin.rotation.y += dt * 2.4;
    }

    for (const f of W3.fires) {
      f.userData.outer.scale.set(1, 0.88 + 0.25 * Math.sin(t * 11 + f.userData.phase), 1);
      f.userData.core.scale.set(1, 0.8 + 0.3 * Math.cos(t * 15 + f.userData.phase), 1);
    }

    if (W3.cursorGroup && W3.cursorGroup.visible) {
      W3.cursorRing.scale.setScalar(1 + 0.12 * Math.sin(t * 6));
    }

    for (let i = W3.projectiles.length - 1; i >= 0; i--) {
      const p = W3.projectiles[i];
      p.elapsed += dt;
      const k = Math.min(1, p.elapsed / p.duration);
      p.mesh.position.lerpVectors(p.from, p.to, k);
      p.mesh.position.y += 4 * p.arc * k * (1 - k);
      p.smokeAcc += dt;
      if (p.smokeAcc > 0.03) {
        p.smokeAcc = 0;
        spawnBurst3D(p.mesh.position, { n: 2, colors: [0xcbd5e1, 0xfb923c], speed: 0.7, up: 0.8, grav: -0.8, size: 0.12, life: 0.35 });
      }
      if (k >= 1) {
        W3.fxGroup.remove(p.mesh);
        W3.projectiles.splice(i, 1);
        p.done();
      }
    }

    for (let i = W3.particles.length - 1; i >= 0; i--) {
      const m = W3.particles[i], u = m.userData;
      u.age += dt;
      if (u.age >= u.life) {
        W3.fxGroup.remove(m); m.material.dispose(); W3.particles.splice(i, 1); continue;
      }
      u.vy -= u.grav * dt;
      m.position.x += u.vx * dt; m.position.y += u.vy * dt; m.position.z += u.vz * dt;
      m.rotation.x += u.spin * dt; m.rotation.y += u.spin * dt;
      const left = 1 - u.age / u.life;
      m.scale.setScalar(Math.max(0.01, left * (u.baseSize || 0.24)));
      m.material.opacity = left;
    }

    for (let i = W3.rings.length - 1; i >= 0; i--) {
      const m = W3.rings[i], u = m.userData;
      u.age += dt;
      if (u.age >= u.life) {
        W3.fxGroup.remove(m); m.material.dispose(); W3.rings.splice(i, 1); continue;
      }
      const k = u.age / u.life;
      m.scale.setScalar(1 + (u.maxScale - 1) * k);
      m.material.opacity = 1 - k;
    }

    const lerpK = 1 - Math.exp(-5.5 * dt);
    W3.camTarget.lerp(W3.camGoalTarget, lerpK);
    W3.camSph.r += (W3.camGoalSph.r - W3.camSph.r) * lerpK;
    W3.camSph.theta += (W3.camGoalSph.theta - W3.camSph.theta) * lerpK;
    W3.camSph.phi += (W3.camGoalSph.phi - W3.camSph.phi) * lerpK;

    const sp = W3.camSph;
    let sx = 0, sy = 0;
    if (W3.shakeTime > 0) {
      W3.shakeTime = Math.max(0, W3.shakeTime - dt);
      const amp = W3.shakeMag * (W3.shakeTime / 0.42);
      sx = rand(-amp, amp); sy = rand(-amp, amp);
      if (W3.shakeTime <= 0) W3.shakeMag = 0;
    }
    const sinPhi = Math.sin(sp.phi);
    W3.camera.position.set(
      W3.camTarget.x + sp.r * sinPhi * Math.sin(sp.theta) + sx,
      W3.camTarget.y + sp.r * Math.cos(sp.phi) + sy,
      W3.camTarget.z + sp.r * sinPhi * Math.cos(sp.theta)
    );
    W3.camera.lookAt(W3.camTarget);
    W3.renderer.render(W3.scene, W3.camera);
  }

  function ensureInit(containerEl, hooks) {
    if (hooks) H = hooks;
    if (W3.ready) return true;
    if (W3.failed || typeof THREE === "undefined") { W3.failed = true; return false; }
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      renderer.setSize(global.innerWidth, global.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      containerEl.innerHTML = "";
      containerEl.appendChild(renderer.domElement);
      W3.renderer = renderer;
      W3.container = containerEl;
    } catch (e) {
      W3.failed = true;
      return false;
    }

    const scene = new THREE.Scene();
    const skyCv = document.createElement("canvas");
    skyCv.width = 4; skyCv.height = 512;
    const sctx = skyCv.getContext("2d");
    const grad = sctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, "#075985");
    grad.addColorStop(0.38, "#0284c7");
    grad.addColorStop(0.65, "#38bdf8");
    grad.addColorStop(0.84, "#bae6fd");
    grad.addColorStop(1.0, "#0c4a6e");
    sctx.fillStyle = grad; sctx.fillRect(0, 0, 4, 512);
    scene.background = new THREE.CanvasTexture(skyCv);
    scene.fog = new THREE.FogExp2(0x164e63, 0.0085);
    W3.scene = scene;

    W3.camera = new THREE.PerspectiveCamera(44, global.innerWidth / global.innerHeight, 0.5, 280);
    W3.clock = new THREE.Clock();
    W3.raycaster = new THREE.Raycaster();
    W3.hitPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.18);
    W3.camTarget = new THREE.Vector3(0, 0, 0);
    W3.camGoalTarget = new THREE.Vector3(0, 0, 0);

    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x0c4a6e, 0.95));
    const sun = new THREE.DirectionalLight(0xfffbeb, 1.3);
    sun.position.set(22, 38, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 512; sun.shadow.mapSize.height = 512;
    sun.shadow.camera.near = 5; sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
    sun.shadow.bias = -0.0008;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.5);
    rim.position.set(-24, 16, -26);
    scene.add(rim);

    const oGeo = new THREE.PlaneGeometry(240, 240, 38, 38);
    oGeo.rotateX(-Math.PI / 2);
    const posAttr = oGeo.attributes.position;
    const cols = new Float32Array(posAttr.count * 3);
    const cNear = new THREE.Color(0x0ea5e9), cMid = new THREE.Color(0x0369a1), cFar = new THREE.Color(0x082f49);
    const tmpC = new THREE.Color();
    W3.oceanBaseY = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      W3.oceanBaseY[i] = posAttr.getY(i);
      const dist = Math.hypot(posAttr.getX(i), posAttr.getZ(i));
      const k = Math.min(1, dist / 65);
      tmpC.copy(k < 0.45 ? cNear.clone().lerp(cMid, k / 0.45) : cMid.clone().lerp(cFar, (k - 0.45) / 0.55));
      cols[i * 3] = tmpC.r; cols[i * 3 + 1] = tmpC.g; cols[i * 3 + 2] = tmpC.b;
    }
    oGeo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    const ocean = new THREE.Mesh(oGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.24, metalness: 0.18, flatShading: true }));
    ocean.position.y = -0.58;
    ocean.receiveShadow = true;
    scene.add(ocean);
    W3.ocean = ocean;
    W3.partGeo = new THREE.DodecahedronGeometry(1, 0);

    buildEnvironment(scene);
    W3.arenaGroup = new THREE.Group();
    scene.add(W3.arenaGroup);
    W3.fxGroup = new THREE.Group();
    scene.add(W3.fxGroup);
    buildCursor3D();
    bindControls(containerEl);

    global.addEventListener("resize", () => {
      if (!W3.renderer) return;
      W3.camera.aspect = global.innerWidth / global.innerHeight;
      W3.camera.updateProjectionMatrix();
      W3.renderer.setSize(global.innerWidth, global.innerHeight);
    });

    W3.ready = true;
    dirty = true;
    return true;
  }

  function rebuild() {
    if (!W3.ready) { dirty = true; return; }
    dirty = false;
    clearGroup(W3.arenaGroup);
    W3.boardViews = [];
    W3.flagships = [];
    W3.floaters = [];
    W3.fires = [];

    const G = H.getState();
    const teamHex = i => i === 0 ? 0xef4444 : 0x2563eb;

    G.boards.forEach((b, bi) => {
      const cx = boardCenterX(bi), n = b.n, span = n * CELL;
      const bg = new THREE.Group();
      bg.position.set(cx, 0, 0);
      W3.arenaGroup.add(bg);

      const accentHex = !teamMode() ? 0x38bdf8 : teamHex(b.owner);
      const plateSize = (2 * n + 1.4) * CELL;
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(plateSize, plateSize),
        new THREE.MeshBasicMaterial({ color: 0x082f49, transparent: true, opacity: 0.44, side: THREE.DoubleSide })
      );
      plate.rotation.x = -Math.PI / 2; plate.position.y = 0.12;
      bg.add(plate);

      const borderFrame = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(plateSize, 0.14, plateSize)),
        new THREE.LineBasicMaterial({ color: accentHex })
      );
      borderFrame.position.y = 0.18;
      bg.add(borderFrame);

      const glowFrame = new THREE.Mesh(
        new THREE.RingGeometry(plateSize * 0.707 - 0.16, plateSize * 0.707 + 0.18, 4),
        new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      glowFrame.rotation.x = -Math.PI / 2; glowFrame.rotation.z = Math.PI / 4; glowFrame.position.y = 0.17;
      glowFrame.visible = false;
      bg.add(glowFrame);

      const gridPts = [];
      for (let i = -n; i <= n; i++) {
        gridPts.push(new THREE.Vector3(i * CELL, 0.15, -span - 0.4), new THREE.Vector3(i * CELL, 0.15, span + 0.4));
        gridPts.push(new THREE.Vector3(-span - 0.4, 0.15, i * CELL), new THREE.Vector3(span + 0.4, 0.15, i * CELL));
      }
      bg.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(gridPts),
        new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.42 })
      ));

      const axisMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe });
      const axisLen = (2 * n + 1.35) * CELL;
      const axX = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, axisLen, 8), axisMat);
      axX.rotation.z = Math.PI / 2; axX.position.set(0.2, 0.18, 0); bg.add(axX);
      const arrowX = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8), axisMat);
      arrowX.rotation.z = -Math.PI / 2; arrowX.position.set(span + 0.85 * CELL, 0.18, 0); bg.add(arrowX);

      const axY = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, axisLen, 8), axisMat);
      axY.rotation.x = Math.PI / 2; axY.position.set(0, 0.18, -0.2); bg.add(axY);
      const arrowY = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 8), axisMat);
      arrowY.rotation.x = -Math.PI / 2; arrowY.position.set(0, 0.18, -(span + 0.85 * CELL)); bg.add(arrowY);

      const lblX = makeTextSprite("x", { color: "#fde047", font: "italic 900 54px Georgia, serif", scale: 1.0 });
      lblX.position.set(span + 1.2 * CELL, 0.55, 0.35); bg.add(lblX);
      const lblY = makeTextSprite("y", { color: "#fde047", font: "italic 900 54px Georgia, serif", scale: 1.0 });
      lblY.position.set(0.55, 0.55, -(span + 1.15 * CELL)); bg.add(lblY);
      const lblO = makeTextSprite("O", { color: "#fde047", font: "italic 900 44px Georgia, serif", scale: 0.78 });
      lblO.position.set(-0.55, 0.45, 0.55); bg.add(lblO);

      for (let i = -n; i <= n; i++) {
        if (i === 0) continue;
        const tx = makeTextSprite(H.fmt(i), { color: "#e0f2fe", font: "800 38px Segoe UI, Arial", scale: 0.64 });
        tx.position.set(i * CELL, 0.42, 0.56); bg.add(tx);
        const ty = makeTextSprite(H.fmt(i), { color: "#e0f2fe", font: "800 38px Segoe UI, Arial", scale: 0.64 });
        ty.position.set(-0.56, 0.42, -i * CELL); bg.add(ty);
      }

      const dotGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.08, 10);
      const dotMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd });
      for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) {
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(x * CELL, 0.16, -y * CELL);
        bg.add(dot);
      }

      const dynGroup = new THREE.Group();
      bg.add(dynGroup);
      W3.boardViews.push({ group: bg, dynGroup, glowFrame, borderFrame, plateSize });

      const fHex = !teamMode() ? 0x0ea5e9 : teamHex(b.owner);
      const ship = buildShip3D(4, fHex, { flagship: true });
      ship.position.set(cx, 0.05, span + 2.35 * CELL);
      ship.rotation.y = !teamMode() ? Math.PI / 2 : (bi === 0 ? 0.35 : Math.PI - 0.35);
      W3.arenaGroup.add(ship);
      W3.flagships.push(ship);
      W3.floaters.push({ obj: ship, baseY: 0.05, amp: 0.09, speed: 1.6, phase: bi * 2.1, rock: true });
    });

    syncAll();
    updateCameraGoal(true);
  }

  function syncBoard(bi) {
    if (!W3.ready) { dirty = true; return; }
    const G = H.getState();
    const b = G.boards[bi], view = W3.boardViews[bi];
    if (!b || !view) return rebuild();
    clearGroup(view.dynGroup);
    W3.fires = W3.fires.filter(f => f.parent);
    W3.floaters = W3.floaters.filter(f => f.obj.parent);

    const shipColor = !teamMode() ? 0x64748b : (b.owner === 0 ? 0xef4444 : 0x2563eb);

    for (const sh of b.ships) {
      if (!sh.sunk && !b.reveal) continue;
      const xs = sh.cells.map(c => c[0]), ys = sh.cells.map(c => c[1]);
      const avgX = (Math.min(...xs) + Math.max(...xs)) / 2;
      const avgY = (Math.min(...ys) + Math.max(...ys)) / 2;
      const hor = Math.max(...xs) > Math.min(...xs);
      const mesh = buildShip3D(sh.len, shipColor, { sunk: sh.sunk, ghost: !sh.sunk });
      mesh.position.set(avgX * CELL, sh.sunk ? -0.14 : 0.16, -avgY * CELL);
      mesh.rotation.y = hor ? 0 : Math.PI / 2;
      view.dynGroup.add(mesh);
    }

    for (const r of b.radar) {
      const rg = new THREE.Group();
      const area = new THREE.Mesh(
        new THREE.PlaneGeometry(3 * CELL, 3 * CELL),
        new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
      );
      area.rotation.x = -Math.PI / 2; area.position.y = 0.19;
      area.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(3 * CELL, 3 * CELL)), new THREE.LineBasicMaterial({ color: 0x4ade80 })));
      rg.add(area);
      const lbl = makeTextSprite(`📡 ${r.count}`, { color: "#bbf7d0", bg: "rgba(5,46,22,.88)", border: "#4ade80", font: "900 40px Segoe UI, Arial", scale: 0.88 });
      lbl.position.set(-1.05 * CELL, 1.05, -1.05 * CELL);
      rg.add(lbl);
      rg.position.set(r.x * CELL, 0, -r.y * CELL);
      view.dynGroup.add(rg);
    }

    for (let x = -b.n; x <= b.n; x++) for (let y = -b.n; y <= b.n; y++) {
      const k = x + "," + y, shot = b.shots[k], sp = b.specials && b.specials[k];
      if (shot === "miss") {
        const m = buildMissBuoy3D();
        m.position.set(x * CELL, 0, -y * CELL);
        view.dynGroup.add(m);
      } else if (shot === "hit") {
        const f = buildHitFire3D();
        f.position.set(x * CELL, 0.12, -y * CELL);
        view.dynGroup.add(f);
      } else if (shot && ["gift", "beacon", "pirate", "mine"].includes(shot)) {
        const obj = buildSpecial3D(shot, { revealedOnly: false });
        obj.position.set(x * CELL, 0.1, -y * CELL);
        view.dynGroup.add(obj);
        W3.floaters.push({ obj, baseY: 0.1, amp: 0.08, speed: 2.2, phase: rand(0, 6.28), spin: obj.userData.spinPart });
      } else if (!shot && b.reveal && sp) {
        const obj = buildSpecial3D(sp, { revealedOnly: true });
        obj.position.set(x * CELL, 0.1, -y * CELL);
        view.dynGroup.add(obj);
        W3.floaters.push({ obj, baseY: 0.1, amp: 0.06, speed: 1.8, phase: rand(0, 6.28), spin: obj.userData.spinPart });
      }
    }
  }

  function syncAll() {
    if (!W3.ready) { dirty = true; return; }
    H.getState().boards.forEach((_, i) => syncBoard(i));
    markTarget();
  }

  function markTarget() {
    if (!W3.ready) return;
    const G = H.getState();
    const aiming = G.phase === "aim";
    if (W3.container) W3.container.classList.toggle("aiming", aiming);
    G.boards.forEach((b, i) => {
      const v = W3.boardViews[i];
      if (v) v.glowFrame.visible = aiming && targetOf(G.shooter) === b;
    });
    updateCursor();
    updateCameraGoal(false);
  }

  function updateCursor() {
    if (!W3.ready || !W3.cursorGroup) return;
    const G = H.getState(), S = H.getSettings();
    if (G.phase !== "aim") { W3.cursorGroup.visible = false; return; }
    const b = targetOf(G.shooter), bi = G.boards.indexOf(b);
    const { x, y } = G.cursor;
    const cx = boardCenterX(bi);
    const wp = cellWorldPos(bi, x, y, 0);
    W3.cursorGroup.position.set(wp.x, 0, wp.z);
    W3.cursorGroup.visible = true;

    const pX = W3.cursorProjX.geometry.attributes.position;
    pX.setXYZ(0, 0, 0.24, 0); pX.setXYZ(1, 0, 0.24, -wp.z); pX.needsUpdate = true;
    const pY = W3.cursorProjY.geometry.attributes.position;
    pY.setXYZ(0, 0, 0.24, 0); pY.setXYZ(1, cx - wp.x, 0.24, 0); pY.needsUpdate = true;

    W3.cursorRadarBox.visible = G.radarMode;
    if (W3.cursorLabel) { W3.cursorGroup.remove(W3.cursorLabel); W3.cursorLabel = null; }
    if (S.showCoord) {
      W3.cursorLabel = makeTextSprite(H.P(x, y), { color: "#fde047", bg: "rgba(15,23,42,.92)", border: "#fde047", font: "900 42px Segoe UI, Arial", scale: 1.05 });
      W3.cursorLabel.position.set(0, 1.9, 0);
      W3.cursorGroup.add(W3.cursorLabel);
    }
    const shooterShip = W3.flagships[teamMode() ? G.shooter : 0];
    if (shooterShip && shooterShip.userData.turret) {
      const dx = wp.x - shooterShip.position.x, dz = wp.z - shooterShip.position.z;
      shooterShip.userData.turret.rotation.y = Math.atan2(-dz, dx) - shooterShip.rotation.y;
    }
  }

  function flyBallRaw(fromPos, toPos, { duration = 0.76, arc = 6.2 } = {}) {
    return new Promise(resolve => {
      if (!W3.ready || !active) { setTimeout(resolve, duration * 1000); return; }
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0xf97316, emissiveIntensity: 0.75, metalness: 0.8 })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.45 })));
      g.position.copy(fromPos);
      W3.fxGroup.add(g);
      W3.projectiles.push({ mesh: g, from: fromPos.clone(), to: toPos.clone(), duration, arc, elapsed: 0, smokeAcc: 0, done: resolve });
    });
  }

  global.Sea3D = {
    CAM_MODES,
    isReady() { return W3.ready; },
    getCamLabel() { return CAM_MODES[W3.camMode]; },
    setActive(on, containerEl, hooks) {
      if (hooks) H = hooks;
      if (on) {
        if (!ensureInit(containerEl, hooks)) return false;
        active = true;
        if (dirty) rebuild();
        else { syncAll(); updateCameraGoal(true); }
        W3.clock.getDelta();
        if (!rafId) rafId = requestAnimationFrame(loop);
        return true;
      }
      active = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      return true;
    },
    markDirty() { dirty = true; },
    rebuild() { if (active && W3.ready) rebuild(); else dirty = true; },
    syncBoard(bi) { if (active && W3.ready) syncBoard(bi); else dirty = true; },
    syncAll() { if (active && W3.ready) syncAll(); else dirty = true; },
    markTarget() { if (active && W3.ready) markTarget(); },
    updateCursor() { if (active && W3.ready) updateCursor(); },
    resetOrbit() { W3.userOrbitOffset = { theta: 0, phi: 0, rScale: 1 }; if (active && W3.ready) updateCameraGoal(false); },
    cycleCamera() {
      W3.camMode = (W3.camMode + 1) % CAM_MODES.length;
      W3.userOrbitOffset = { theta: 0, phi: 0, rScale: 1 };
      if (active && W3.ready) updateCameraGoal(false);
      return CAM_MODES[W3.camMode];
    },
    setCameraMode(m) {
      W3.camMode = m % CAM_MODES.length;
      W3.userOrbitOffset = { theta: 0, phi: 0, rScale: 1 };
      if (active && W3.ready) updateCameraGoal(false);
      return CAM_MODES[W3.camMode];
    },
    hideCursor() { if (W3.cursorGroup) W3.cursorGroup.visible = false; },
    flyBall(shooterIdx, targetBi, x, y) {
      const toPos = cellWorldPos(targetBi, x, y, 0.28);
      const shooterShip = W3.flagships[teamMode() ? shooterIdx : 0];
      const fromPos = shooterShip ? shooterShip.position.clone().add(new THREE.Vector3(0, 1.05, 0)) : new THREE.Vector3(0, 1.2, 14);
      if (shooterShip && shooterShip.userData.turret) {
        const dx = toPos.x - shooterShip.position.x, dz = toPos.z - shooterShip.position.z;
        shooterShip.userData.turret.rotation.y = Math.atan2(-dz, dx) - shooterShip.rotation.y;
        spawnBurst3D(fromPos, { n: 18, colors: [0xfef08a, 0xf97316, 0xe2e8f0], speed: 4.5, up: 2.5, grav: 2, size: 0.18, life: 0.45 });
      }
      const arc = Math.max(4.8, fromPos.distanceTo(toPos) * 0.28);
      return flyBallRaw(fromPos, toPos, { duration: 0.76, arc });
    },
    async enemyStrike(bi, sleepFn) {
      const ship = W3.flagships[0];
      const target = ship ? ship.position.clone().add(new THREE.Vector3(0, 0.7, 0)) : new THREE.Vector3(0, 0.5, 8);
      const n = H.getState().boards[bi].n;
      const flights = [];
      for (let i = 0; i < 3; i++) {
        const from = cellWorldPos(bi, rand(-n, n), rand(0, n), 0.7);
        flights.push(flyBallRaw(from, target.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-0.6, 0.6))), { duration: 0.65, arc: 4.5 }));
        await sleepFn(140);
      }
      await Promise.all(flights);
      triggerShake(0.7, 0.5);
      spawnBurst3D(target, { n: 55, colors: [0xfde047, 0xf97316, 0xef4444, 0xffffff], speed: 10, up: 8, size: 0.28, life: 0.95 });
    },
    fxImpact(kind, bi, x, y, extra) {
      if (!W3.ready || !active) return;
      const p = cellWorldPos(bi, x, y, 0.28);
      if (kind === "hit") {
        triggerShake(0.55, 0.38);
        spawnBurst3D(p, { n: 55, colors: [0xfde047, 0xf97316, 0xef4444, 0xffffff, 0x7c2d12], speed: 10.5, up: 9, size: 0.27, life: 0.95 });
        spawnRing3D(p, { color: 0xf97316, maxScale: 5.5, life: 0.65 });
      } else if (kind === "sink" && extra && extra.cells) {
        triggerShake(0.75, 0.5);
        extra.cells.forEach(([cx, cy]) => {
          const cp = cellWorldPos(bi, cx, cy, 0.35);
          spawnBurst3D(cp, { n: 26, colors: [0xfde047, 0xf97316, 0xbae6fd, 0xffffff], speed: 7, up: 7, size: 0.24, life: 0.9 });
          spawnRing3D(cp, { color: 0xbae6fd, maxScale: 4.2, life: 0.85 });
        });
      } else if (kind === "gift") {
        spawnBurst3D(p, { n: 55, colors: [0xfde047, 0xf59e0b, 0x4ade80, 0xffffff], speed: 8.5, up: 9.5, grav: 12, size: 0.24, life: 1.0 });
        spawnRing3D(p, { color: 0xfde047, maxScale: 5.8, life: 0.85 });
      } else if (kind === "beacon" || kind === "radar") {
        spawnBurst3D(p, { n: 36, colors: [0x4ade80, 0x38bdf8, 0xbbf7d0, 0xffffff], speed: 6.5, up: 5.5, grav: 8, size: 0.2, life: 0.8 });
        spawnRing3D(p, { color: 0x4ade80, maxScale: 8.2, life: 0.9 });
      } else if (kind === "pirate") {
        triggerShake(0.6, 0.42);
        spawnBurst3D(p, { n: 50, colors: [0xa855f7, 0xf43f5e, 0x0f172a, 0xef4444], speed: 8.5, up: 7.5, size: 0.24, life: 0.95 });
        spawnRing3D(p, { color: 0xf43f5e, maxScale: 5.5, life: 0.8 });
      } else if (kind === "mine") {
        triggerShake(0.85, 0.5);
        spawnBurst3D(p, { n: 65, colors: [0xf97316, 0xef4444, 0xfde047, 0x1e293b], speed: 11, up: 10.5, size: 0.28, life: 1.0 });
        spawnRing3D(p, { color: 0xef4444, maxScale: 6.5, life: 0.8 });
      } else if (kind === "miss") {
        spawnBurst3D(p, { n: 38, colors: [0xe0f2fe, 0x7dd3fc, 0xffffff, 0x0ea5e9], speed: 4.5, up: 8.5, grav: 18, size: 0.19, life: 0.85 });
        spawnRing3D(p, { color: 0xe0f2fe, maxScale: 4.6, life: 0.8 });
      }
    }
  };
})(window);
