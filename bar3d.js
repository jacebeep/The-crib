/**
 * THA CRIB — "The Ledger": the home bar + Marcus, the house bartender (real-time 3D).
 *
 * - Builds a walnut + black-marble bar with a backlit bottle wall into the villa's ground floor
 * - Loads Marcus (rigged, skinned GLB with mouthOpen / mouthSmile blendshapes)
 * - Drives him procedurally every frame:
 *     two-bone arm IK + palm/finger control, spine lean + breathing, neck/head look-at,
 *     eye gaze + saccades, eyelid blinks, idle routines (wiping the counter, leaning in,
 *     arms crossed), emotion poses, gestures (nod, shake, wave, shrug, fist pump) and lip-sync
 */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = (k, dt) => 1 - Math.exp(-k * dt);
  function makeRng(s) {
    s = Math.max(1, Math.floor(Math.abs(s)) % 2147483646);
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // Bar footprint (world meters): ground floor, west half, between the dining table and the inland wall
  const BAR = { x0: -8.2, x1: -3.4, cz0: 2.6, cz1: 3.25, bz0: 5.0, bz1: 5.55, mx: -5.8, mz: 3.62 };
  const TOP = 1.06;      // counter body height above the floor (marble slab sits on top)
  const SLAB = 0.05;     // marble thickness
  const HEIGHT = 1.84;   // Marcus, head to toe
  const HAND_Y = TOP + SLAB + 0.045; // wrist height when a hand rests on the marble

  // ------------------------------------------------------------------
  // Body language library — character space:
  //   +x = Marcus's left, +y = up, +z = toward the guest (meters from his feet)
  //   hand: IK target for the wrist, pole: where the elbow points,
  //   dir: wrist -> fingers, palm: palm normal, curl: 0 open .. 1 fist
  // ------------------------------------------------------------------
  const V = (x, y, z) => [x, y, z];
  const mirror = (s) => ({
    hand: [-s.hand[0], s.hand[1], s.hand[2]],
    pole: [-s.pole[0], s.pole[1], s.pole[2]],
    dir: [-s.dir[0], s.dir[1], s.dir[2]],
    palm: [-s.palm[0], s.palm[1], s.palm[2]],
    curl: s.curl
  });

  const ARM = {
    relaxed: { hand: V(0.25, 0.95, 0.08), pole: V(0.25, -0.1, -1), dir: V(0.04, -1, 0.12), palm: V(-1, 0, 0.1), curl: 0.35 },
    lean: { hand: V(0.3, HAND_Y, 0.42), pole: V(1, 0.15, -0.6), dir: V(-0.2, -0.05, 1), palm: V(0, -1, 0), curl: 0.18 },
    crossedOver: { hand: V(-0.15, 1.2, 0.2), pole: V(1, -0.6, 0.1), dir: V(-1, 0.1, 0.05), palm: V(0, 0, -1), curl: 0.5 },
    crossedUnder: { hand: V(0.17, 1.24, 0.11), pole: V(1, -0.6, 0.1), dir: V(1, 0.15, -0.05), palm: V(0, 0, -1), curl: 0.55 },
    explain: { hand: V(0.27, 1.22, 0.34), pole: V(1, -0.7, -0.4), dir: V(0.3, 0.12, 1), palm: V(-0.45, 0.85, 0.1), curl: 0.2 },
    shrug: { hand: V(0.38, 1.12, 0.27), pole: V(0.6, -1, -0.5), dir: V(0.6, 0.1, 0.8), palm: V(0.1, 1, 0.15), curl: 0.1 },
    chin: { hand: V(0.03, 1.57, 0.17), pole: V(0.35, -1, 0.1), dir: V(-0.1, 0.95, 0.25), palm: V(0, 0.2, -1), curl: 0.75 },
    hug: { hand: V(-0.1, 1.12, 0.2), pole: V(0.8, -0.8, -0.2), dir: V(-1, 0.05, 0.2), palm: V(0, 1, 0), curl: 0.55 },
    wave: { hand: V(0.4, 1.78, 0.16), pole: V(1, -1, -0.2), dir: V(0.05, 1, 0.05), palm: V(0, 0, 1), curl: 0.05 },
    fist: { hand: V(0.2, 1.5, 0.32), pole: V(1, -0.8, 0), dir: V(0, 1, 0.15), palm: V(-1, 0, 0), curl: 1 },
    wipe: { hand: V(0.14, HAND_Y, 0.45), pole: V(1, 0.2, -0.6), dir: V(-0.1, -0.1, 1), palm: V(0, -1, 0), curl: 0.2 }
  };

  // L = his left arm, R = his right arm (right arm specs are mirrored from the left-arm library)
  const POSES = {
    relaxed: { spine: 0.02, sh: [0, 0], head: [0.03, 0, 0], look: 1, L: ARM.relaxed, R: mirror(ARM.relaxed) },
    lean: { spine: 0.16, sh: [0.02, 0.02], head: [0, 0, 0], look: 1, L: ARM.lean, R: mirror(ARM.lean) },
    wipe: { spine: 0.2, sh: [0.02, 0.05], head: [0.12, 0, 0], look: 0.2, L: ARM.lean, R: mirror(ARM.wipe), k: 9 },
    crossed: { spine: -0.04, sh: [0.03, 0.03], head: [0, 0, 0], look: 1, L: ARM.crossedOver, R: mirror(ARM.crossedUnder) },
    think: { spine: 0.03, sh: [0, 0.04], head: [-0.05, 0.16, 0.05], look: 0.25, gaze: [0.35, 0.3], L: ARM.hug, R: mirror(ARM.chin) },
    explain: { spine: 0.06, sh: [0, 0], head: [0, 0, 0], look: 1, L: ARM.explain, R: mirror(ARM.explain) },
    shrug: { spine: -0.02, sh: [0.09, 0.09], head: [0.02, 0, 0.12], look: 1, L: ARM.shrug, R: mirror(ARM.shrug), k: 8 },
    wave: { spine: 0.0, sh: [0, 0.06], head: [0, 0, -0.06], look: 1, L: ARM.lean, R: mirror(ARM.wave), k: 7 },
    celebrate: { spine: 0.0, sh: [0, 0.05], head: [-0.06, 0, 0], look: 1, L: ARM.lean, R: mirror(ARM.fist), k: 8 }
  };

  // Emotions -> resting body language + face
  const EMOTIONS = {
    calm: { pose: 'lean', smile: 0.2, tilt: 0 },
    happy: { pose: 'explain', smile: 0.8, tilt: 0.04, gesture: 'nod' },
    proud: { pose: 'explain', smile: 0.75, tilt: 0, gesture: 'celebrate' },
    impressed: { pose: 'explain', smile: 0.55, tilt: -0.04, gesture: 'nod' },
    amused: { pose: 'lean', smile: 0.7, tilt: 0.07, gesture: 'chuckle' },
    concerned: { pose: 'lean', smile: -0.3, tilt: 0.1, gesture: 'shake' },
    skeptical: { pose: 'crossed', smile: 0.1, tilt: 0.12, gesture: 'tilt' },
    thinking: { pose: 'think', smile: 0.05, tilt: 0.05 },
    serious: { pose: 'explain', smile: 0, tilt: 0, gesture: 'nod' }
  };

  const ARM_BONES = ['Shoulder', 'Arm', 'ForeArm', 'Hand'];
  const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];
  const FINGER_GAIN = { Index: 0.85, Middle: 1, Ring: 1.08, Pinky: 1.15 };

  class CribBar {
    constructor(mansion, parent, f0) {
      this.m = mansion;
      this.parent = parent;
      this.f0 = f0;
      this.ready = false;

      // behaviour state
      this.mode = 'idle';         // 'idle' | 'listening' | 'thinking' | 'speaking'
      this.emotion = 'calm';
      this.engaged = false;       // guest sitting at the bar
      this.speechLevel = 0;       // 0..1, fed by the voice analyser
      this.idlePose = 'wipe';
      this.idleUntil = 0;
      this.reactUntil = 0;
      this.gestures = [];
      this.pose = null;
      this.nextBlink = 2;
      this.blinkT = -1;
      this.blinkDouble = false;
      this.saccade = new THREE.Vector2();
      this.nextSaccade = 1;
      this.glanceUntil = 0;
      this.nextGlance = 3;

      this.lights = [];
      this.lightLevel = 0.45;
      this.lightTarget = 0.45;
      this.neonFlicker = 0;

      this._v = [0, 1, 2, 3, 4, 5, 6].map(() => new THREE.Vector3());
      this._q = [0, 1, 2, 3].map(() => new THREE.Quaternion());

      this.buildMaterials();
      this.buildBar();
      this.buildLights();
      this.loadMarcus();
    }

    // ============================================================
    // MATERIALS + PROCEDURAL TEXTURES
    // ============================================================
    buildMaterials() {
      const M = this.m.mat;
      this.mat = {
        walnut: M.door,
        walnutDark: new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.55, metalness: 0.05 }),
        marble: new THREE.MeshPhysicalMaterial({
          map: this.makeMarbleTexture(), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2
        }),
        gold: M.gold,
        brass: new THREE.MeshStandardMaterial({ color: 0xc8a25a, roughness: 0.3, metalness: 1 }),
        leather: new THREE.MeshStandardMaterial({ color: 0x6b3a1f, roughness: 0.55, metalness: 0 }),
        blackMetal: new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.4, metalness: 0.8 }),
        smokedMirror: new THREE.MeshStandardMaterial({ color: 0x1d1612, roughness: 0.16, metalness: 0.95, envMapIntensity: 1.4 }),
        shelfGlass: new THREE.MeshPhysicalMaterial({
          color: 0xffe2b8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, envMapIntensity: 2, depthWrite: false
        }),
        led: new THREE.MeshBasicMaterial({ color: 0xffb35c, toneMapped: false }),
        ledSoft: new THREE.MeshBasicMaterial({ color: 0xff9a45, transparent: true, opacity: 0.55, toneMapped: false }),
        globe: new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false }),
        bottle: new THREE.MeshPhysicalMaterial({
          color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.86, clearcoat: 1,
          emissive: 0x2a1404, envMapIntensity: 1.8
        }),
        label: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
        cap: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.7 }),
        glass: new THREE.MeshPhysicalMaterial({
          color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.28, clearcoat: 1, envMapIntensity: 2.4, depthWrite: false
        }),
        whiskey: new THREE.MeshPhysicalMaterial({ color: 0xb8601a, roughness: 0.05, transparent: true, opacity: 0.82, emissive: 0x3a1500, clearcoat: 1 }),
        ice: new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.12, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }),
        towel: new THREE.MeshStandardMaterial({ map: this.makeTowelTexture(), roughness: 1 })
      };
    }

    makeMarbleTexture() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 512;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 1024, 512);
      grd.addColorStop(0, '#16161a');
      grd.addColorStop(1, '#0a0a0c');
      g.fillStyle = grd;
      g.fillRect(0, 0, 1024, 512);
      const rng = makeRng(77);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(255,255,255,${0.01 + rng() * 0.02})`;
        g.beginPath();
        g.ellipse(rng() * 1024, rng() * 512, 40 + rng() * 160, 10 + rng() * 50, rng() * 3, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 16; i++) {
        const goldVein = i % 4 === 0;
        g.strokeStyle = goldVein ? 'rgba(214,178,106,0.6)' : 'rgba(236,236,242,0.22)';
        g.shadowColor = goldVein ? 'rgba(214,178,106,0.6)' : 'rgba(255,255,255,0.25)';
        g.shadowBlur = goldVein ? 6 : 3;
        g.lineWidth = 0.6 + rng() * (goldVein ? 2.4 : 1.6);
        g.beginPath();
        let x = -50 + rng() * 300, y = rng() * 512;
        g.moveTo(x, y);
        for (let k = 0; k < 9; k++) {
          const nx = x + 60 + rng() * 120, ny = y + (rng() - 0.5) * 120;
          g.quadraticCurveTo(x + (nx - x) / 2 + (rng() - 0.5) * 60, y + (rng() - 0.5) * 90, nx, ny);
          x = nx;
          y = ny;
        }
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      return tex;
    }

    makeTowelTexture() {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#efe9de';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#b8862f';
      g.fillRect(0, 18, 128, 6);
      g.fillRect(0, 104, 128, 6);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
        g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    makeNeonTexture() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 320;
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      const draw = () => {
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '700 150px Kalam, "Brush Script MT", cursive';
        for (const [blur, col] of [[46, 'rgba(255,140,50,0.9)'], [22, 'rgba(255,170,80,1)'], [6, 'rgba(255,220,170,1)']]) {
          g.shadowColor = col;
          g.shadowBlur = blur;
          g.fillStyle = blur > 20 ? 'rgba(255,190,110,0.9)' : '#fff3df';
          g.fillText('The Ledger', 512, 128);
        }
        g.shadowBlur = 14;
        g.shadowColor = 'rgba(255,170,80,1)';
        g.fillStyle = '#ffd9a3';
        g.font = '600 38px Outfit, sans-serif';
        g.fillText('B A R   &   M O N E Y   T A L K', 512, 262);
        tex.needsUpdate = true;
      };
      draw();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      return tex;
    }

    // ============================================================
    // THE BAR
    // ============================================================
    buildBar() {
      const m = this.m, P = this.parent, f0 = this.f0, X = this.mat;
      const S = (a, b, c, d, e, f, mat, t = 1, sh = true) => m.slab(a, b, c, d, e, f, mat, t, P, sh);
      const top = f0 + TOP;

      // --- Front counter: walnut body, fluted face, black-marble top, gold foot rail ---
      S(BAR.x0, BAR.x1, f0, top, BAR.cz0, BAR.cz1, X.walnut, 1.2);
      const flutes = Math.floor((BAR.x1 - BAR.x0 - 0.06) / 0.085);
      const fluteGeo = new THREE.CylinderGeometry(0.03, 0.03, TOP - 0.2, 10, 1, false, Math.PI, Math.PI);
      const fluteMesh = new THREE.InstancedMesh(fluteGeo, X.walnutDark, flutes);
      const mtx = new THREE.Matrix4();
      for (let i = 0; i < flutes; i++) {
        mtx.makeTranslation(BAR.x0 + 0.07 + i * 0.085, f0 + 0.12 + (TOP - 0.2) / 2, BAR.cz0);
        fluteMesh.setMatrixAt(i, mtx);
      }
      fluteMesh.castShadow = true;
      fluteMesh.receiveShadow = true;
      P.add(fluteMesh);
      S(BAR.x0 - 0.02, BAR.x1 + 0.02, f0, f0 + 0.1, BAR.cz0 - 0.03, BAR.cz1, X.blackMetal, 1);  // plinth
      S(BAR.x0 - 0.1, BAR.x1 + 0.1, top, top + SLAB, BAR.cz0 - 0.12, BAR.cz1 + 0.06, X.marble, 1.6);
      S(BAR.x0 - 0.1, BAR.x1 + 0.1, top - 0.012, top, BAR.cz0 - 0.1, BAR.cz0 - 0.085, X.led, 1, false); // under-glow strip
      S(BAR.x0, BAR.x1, f0 + 0.1, f0 + 0.112, BAR.cz0 - 0.05, BAR.cz0 - 0.035, X.ledSoft, 1, false);   // toe-kick glow
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, BAR.x1 - BAR.x0 - 0.2, 16), X.brass);
      rail.rotation.z = Math.PI / 2;
      rail.position.set((BAR.x0 + BAR.x1) / 2, f0 + 0.24, BAR.cz0 - 0.17);
      rail.castShadow = true;
      P.add(rail);
      for (let x = BAR.x0 + 0.3; x < BAR.x1 - 0.2; x += 1.15) {
        S(x - 0.012, x + 0.012, f0 + 0.24, f0 + 0.26, BAR.cz0 - 0.17, BAR.cz0, X.brass, 1);
      }

      // --- Back bar: walnut cabinet, smoked-mirror wall, glass shelves with LED edges ---
      const bx0 = BAR.x0 - 0.2, bx1 = BAR.x1 + 0.2;
      S(bx0, bx1, f0, f0 + 0.95, BAR.bz0, BAR.bz1, X.walnut, 1.2);
      S(bx0, bx1, f0 + 0.95, f0 + 0.99, BAR.bz0 - 0.04, BAR.bz1, X.marble, 1.6);
      S(bx0, bx1, f0, f0 + 0.04, BAR.bz0 - 0.005, BAR.bz0, X.gold, 1, false);
      for (let x = bx0 + 0.6; x < bx1 - 0.3; x += 1.2) S(x, x + 0.02, f0 + 0.1, f0 + 0.85, BAR.bz0 - 0.012, BAR.bz0, X.gold, 1, false); // brass pulls
      S(bx0, bx1, f0 + 0.99, f0 + 3.3, BAR.bz1 - 0.04, BAR.bz1, X.smokedMirror, 1, false);
      S(bx0 - 0.1, bx0, f0, f0 + 3.3, BAR.bz0 + 0.1, BAR.bz1, X.walnutDark, 1);
      S(bx1, bx1 + 0.1, f0, f0 + 3.3, BAR.bz0 + 0.1, BAR.bz1, X.walnutDark, 1);
      S(bx0 - 0.1, bx1 + 0.1, f0 + 3.3, f0 + 3.42, BAR.bz0 + 0.05, BAR.bz1, X.walnutDark, 1);
      const shelfY = [f0 + 1.42, f0 + 1.92, f0 + 2.42];
      for (const y of shelfY) {
        S(bx0, bx1, y - 0.012, y + 0.012, BAR.bz0 + 0.18, BAR.bz1 - 0.05, X.shelfGlass, 1, false);
        S(bx0, bx1, y - 0.03, y - 0.018, BAR.bz0 + 0.18, BAR.bz0 + 0.2, X.led, 1, false);
      }
      this.buildBottles(bx0 + 0.15, bx1 - 0.15, [f0 + 0.99].concat(shelfY.map((y) => y + 0.012)));

      // --- Neon sign over the bottle wall ---
      const neon = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 0.75),
        new THREE.MeshBasicMaterial({ map: this.makeNeonTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      );
      neon.rotation.y = Math.PI; // faces the room (-z)
      neon.position.set((BAR.x0 + BAR.x1) / 2, f0 + 2.92, BAR.bz1 - 0.06);
      P.add(neon);
      this.neon = neon;

      // --- Pendant globes over the counter ---
      const ceil = 3.96;
      this.globes = [];
      for (const x of [-7.3, -5.8, -4.3]) {
        const gy = f0 + 2.35;
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), X.globe);
        globe.position.set(x, gy, (BAR.cz0 + BAR.cz1) / 2);
        P.add(globe);
        this.globes.push(globe);
        const capM = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.06, 16), X.brass);
        capM.position.set(x, gy + 0.13, globe.position.z);
        P.add(capM);
        S(x - 0.004, x + 0.004, gy + 0.16, ceil, globe.position.z - 0.004, globe.position.z + 0.004, X.brass, 1, false);
      }

      // --- Stools (gap in the middle is where the guest sits) ---
      for (const x of [-7.5, -6.6, -4.55, -3.75]) this.stool(x, BAR.cz0 - 0.48);

      // --- Props: the guest's drink, a coaster, a gold shaker, the towel ---
      const gx = -5.48, gz = BAR.cz0 + 0.18, gy = top + SLAB;
      const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 32), X.blackMetal);
      coaster.position.set(gx, gy + 0.003, gz);
      P.add(coaster);
      this.rocksGlass(gx, gy + 0.006, gz);
      const shaker = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.042, 0), new THREE.Vector2(0.046, 0.12), new THREE.Vector2(0.038, 0.16),
        new THREE.Vector2(0.03, 0.2), new THREE.Vector2(0.016, 0.22), new THREE.Vector2(0.018, 0.24), new THREE.Vector2(0, 0.245)
      ], 28), X.brass);
      shaker.position.set(-7.6, gy, BAR.cz1 - 0.12);
      shaker.castShadow = true;
      P.add(shaker);
      this.towel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.2), X.towel);
      this.towel.position.set(-6.2, gy + 0.006, BAR.cz1 - 0.15);
      this.towel.receiveShadow = true;
      P.add(this.towel);
      this.counterTopY = gy;
    }

    stool(x, z) {
      const X = this.mat, f0 = this.f0, P = this.parent;
      const g = new THREE.Group();
      g.position.set(x, f0, z);
      P.add(g);
      const add = (geo, mat, y) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = y;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
        return mesh;
      };
      add(new THREE.CylinderGeometry(0.22, 0.24, 0.025, 32), X.blackMetal, 0.0125);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.74, 12), X.brass, 0.39);
      const ring = add(new THREE.TorusGeometry(0.17, 0.012, 8, 40), X.brass, 0.32);
      ring.rotation.x = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.2, 0.18, 0.07, 32), X.leather, 0.79);
      const pipe = add(new THREE.TorusGeometry(0.2, 0.012, 8, 40), X.brass, 0.765);
      pipe.rotation.x = Math.PI / 2;
    }

    rocksGlass(x, y, z) {
      const X = this.mat, P = this.parent;
      const glass = new THREE.Mesh(new THREE.LatheGeometry([
        new THREE.Vector2(0, 0), new THREE.Vector2(0.04, 0), new THREE.Vector2(0.043, 0.004), new THREE.Vector2(0.045, 0.09),
        new THREE.Vector2(0.042, 0.09), new THREE.Vector2(0.04, 0.012), new THREE.Vector2(0, 0.012)
      ], 32), X.glass);
      glass.position.set(x, y, z);
      glass.renderOrder = 3;
      P.add(glass);
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.038, 0.035, 32), X.whiskey);
      liquid.position.set(x, y + 0.03, z);
      liquid.renderOrder = 2;
      P.add(liquid);
      const ice = new THREE.Mesh(new THREE.SphereGeometry(0.026, 20, 14), X.ice);
      ice.position.set(x + 0.004, y + 0.042, z - 0.003);
      ice.renderOrder = 2;
      P.add(ice);
    }

    buildBottles(x0, x1, ys) {
      const X = this.mat, P = this.parent;
      const v2 = (r, y) => new THREE.Vector2(r, y);
      const shapes = [
        { body: [v2(0, 0), v2(0.042, 0), v2(0.044, 0.01), v2(0.044, 0.2), v2(0.036, 0.24), v2(0.014, 0.27), v2(0.013, 0.32), v2(0, 0.32)], label: [0.045, 0.07, 0.08], cap: [0.015, 0.03, 0.32] },
        { body: [v2(0, 0), v2(0.036, 0), v2(0.037, 0.01), v2(0.037, 0.24), v2(0.03, 0.28), v2(0.012, 0.3), v2(0.012, 0.36), v2(0, 0.36)], label: [0.038, 0.08, 0.1], cap: [0.014, 0.025, 0.36] },
        { body: [v2(0, 0), v2(0.06, 0), v2(0.066, 0.03), v2(0.062, 0.12), v2(0.04, 0.17), v2(0.016, 0.19), v2(0.016, 0.23), v2(0, 0.23)], label: [0.067, 0.04, 0.05], cap: [0.026, 0.035, 0.235] },
        { body: [v2(0, 0), v2(0.04, 0), v2(0.042, 0.02), v2(0.042, 0.16), v2(0.042, 0.18), v2(0.03, 0.2), v2(0.03, 0.25), v2(0, 0.25)], label: [0.043, 0.06, 0.07], cap: [0.032, 0.03, 0.25] }
      ];
      const liquors = [0xc26a1c, 0x9a4410, 0xd8a24a, 0x2d5a33, 0xe7eef2, 0x7a1d24, 0xb98a30, 0x1c3d5a];
      const labels = [0xf2e8d2, 0x111111, 0xd6b26a, 0x2b2420];
      const caps = [0xd6b26a, 0x151515, 0x8a5a2b, 0xc0c0c0];
      const rng = makeRng(2026);
      const perShelf = Math.floor((x1 - x0) / 0.14);
      const items = [];
      for (const y of ys) {
        for (let i = 0; i < perShelf; i++) {
          if (rng() < 0.08) continue;
          items.push({ x: x0 + 0.07 + i * 0.14 + (rng() - 0.5) * 0.03, y, z: BAR.bz0 + 0.33 + (rng() - 0.5) * 0.06, s: Math.floor(rng() * shapes.length), k: 0.9 + rng() * 0.25 });
        }
      }
      const mtx = new THREE.Matrix4(), col = new THREE.Color();
      shapes.forEach((sh, si) => {
        const list = items.filter((it) => it.s === si);
        if (!list.length) return;
        const body = new THREE.InstancedMesh(new THREE.LatheGeometry(sh.body, 20), X.bottle, list.length);
        const label = new THREE.InstancedMesh(new THREE.CylinderGeometry(sh.label[0], sh.label[0], sh.label[1], 20, 1, true), X.label, list.length);
        const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(sh.cap[0], sh.cap[0], sh.cap[1], 14), X.cap, list.length);
        list.forEach((it, i) => {
          mtx.makeScale(1, it.k, 1).setPosition(it.x, it.y, it.z);
          body.setMatrixAt(i, mtx);
          body.setColorAt(i, col.setHex(liquors[Math.floor(rng() * liquors.length)]));
          mtx.makeScale(1, it.k, 1).setPosition(it.x, it.y + sh.label[2] * it.k, it.z);
          label.setMatrixAt(i, mtx);
          label.setColorAt(i, col.setHex(labels[Math.floor(rng() * labels.length)]));
          mtx.makeScale(1, 1, 1).setPosition(it.x, it.y + sh.cap[2] * it.k, it.z);
          cap.setMatrixAt(i, mtx);
          cap.setColorAt(i, col.setHex(caps[Math.floor(rng() * caps.length)]));
        });
        P.add(body, label, cap);
      });
    }

    buildLights() {
      const P = this.parent, f0 = this.f0;
      const add = (light, base) => {
        P.add(light);
        this.lights.push({ light, base });
        return light;
      };
      // warm pendants over the counter
      const p1 = add(new THREE.PointLight(0xffc684, 1.5, 7, 2), 1.5);
      p1.position.set(-7.0, f0 + 2.2, 2.95);
      const p2 = add(new THREE.PointLight(0xffc684, 1.5, 7, 2), 1.5);
      p2.position.set(-4.6, f0 + 2.2, 2.95);
      // bottle-wall glow (rim light behind Marcus)
      const rim = add(new THREE.PointLight(0xff9d4d, 1.8, 6, 2), 1.8);
      rim.position.set(-5.8, f0 + 2.0, BAR.bz0 + 0.15);
      // soft key light on his face from the guest side
      const key = add(new THREE.SpotLight(0xffe6c8, 2.2, 9, 0.42, 0.7, 2), 2.2);
      key.position.set(-5.2, f0 + 2.9, 1.2);
      key.target.position.set(BAR.mx, f0 + 1.65, BAR.mz);
      P.add(key.target);
      this.setLights(this.lightLevel, true);
    }

    // 0..1 — dim while you're elsewhere in the house, full glow when you sit down
    setLights(level, instant) {
      this.lightTarget = level;
      if (instant) this.lightLevel = level;
      if (level > 0.9 && !instant) this.neonFlicker = 1.1;
    }

    updateLights(dt) {
      this.lightLevel += (this.lightTarget - this.lightLevel) * ease(2.2, dt);
      for (const l of this.lights) l.light.intensity = l.base * this.lightLevel;
      let neon = 0.55 + this.lightLevel * 0.45;
      if (this.neonFlicker > 0) {
        this.neonFlicker -= dt;
        const f = Math.sin(this.neonFlicker * 61) * Math.sin(this.neonFlicker * 23);
        if (this.neonFlicker > 0.25) neon *= f > 0.2 ? 1 : 0.15;
      }
      if (this.neon) this.neon.material.opacity = neon;
    }

    // ============================================================
    // MARCUS — load + rig setup
    // ============================================================
    loadMarcus() {
      if (!THREE.GLTFLoader) return;
      new THREE.GLTFLoader().load('assets/models/marcus.glb', (gltf) => {
        try {
          this.setupMarcus(gltf.scene);
        } catch (e) {
          console.warn('Marcus rig setup failed:', e);
        }
      }, undefined, (err) => console.warn('Marcus failed to load:', err));
    }

    setupMarcus(model) {
      const root = new THREE.Group();
      root.position.set(BAR.mx, this.f0, BAR.mz);
      root.rotation.y = Math.PI; // faces the guest side of the counter (-z)
      this.parent.add(root);
      root.add(model);
      this.root = root;
      this.model = model;

      const B = {};
      model.traverse((o) => {
        if (o.isBone) B[o.name] = o;
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
        }
      });
      this.B = B;

      // normalise height
      model.updateMatrixWorld(true);
      const headTop = (B.HeadTop_End || B.Head).getWorldPosition(new THREE.Vector3());
      const h = headTop.y - this.f0;
      if (h > 0.2) model.scale.multiplyScalar(HEIGHT / h);
      root.updateMatrixWorld(true);

      this.styleMarcus(model);

      this.rootQ = root.getWorldQuaternion(new THREE.Quaternion());
      this.fwdW = new THREE.Vector3(0, 0, 1).applyQuaternion(this.rootQ);

      // rest pose (T-pose) snapshot
      this.animBones = [];
      const track = (name) => {
        const b = B[name];
        if (!b) return null;
        b.userData.rest = b.quaternion.clone();
        b.userData.restW = b.getWorldQuaternion(new THREE.Quaternion());
        this.animBones.push(b);
        return b;
      };
      ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftEye', 'RightEye'].forEach(track);
      this.side = {};
      for (const [key, pre] of [['L', 'Left'], ['R', 'Right']]) {
        const s = {};
        ARM_BONES.forEach((n) => { s[n] = track(pre + n); });
        s.fingers = FINGERS.map((f) => ({ name: f, bones: [1, 2, 3].map((i) => track(`${pre}Hand${f}${i}`)).filter(Boolean) }));
        s.thumb = [1, 2, 3].map((i) => track(`${pre}HandThumb${i}`)).filter(Boolean);
        s.mid = B[`${pre}HandMiddle1`];
        const wp = (b) => b.getWorldPosition(new THREE.Vector3());
        const sh = wp(s.Arm), el = wp(s.ForeArm), wr = wp(s.Hand);
        s.a = sh.distanceTo(el);
        s.b = el.distanceTo(wr);
        // palm normal at rest, measured from the hand's own geometry
        const fdir = wp(s.mid).sub(wr).normalize();
        const across = wp(B[`${pre}HandIndex1`]).sub(wp(B[`${pre}HandPinky1`])).normalize();
        s.palmRest = key === 'L' ? fdir.clone().cross(across).normalize() : across.clone().cross(fdir).normalize();
        s.cur = null;
        this.side[key] = s;
      }

      // morph targets (mouth)
      this.morphs = [];
      model.traverse((o) => {
        if (o.isMesh && o.morphTargetDictionary && o.morphTargetInfluences) {
          const d = o.morphTargetDictionary;
          this.morphs.push({ mesh: o, open: d.mouthOpen, smile: d.mouthSmile });
        }
      });

      this.buildAccessories();
      this.face = { smile: 0.15, open: 0, blink: 0 };
      this.lookPoint = new THREE.Vector3(BAR.mx, this.f0 + 1.7, BAR.mz - 2);
      this.ready = true;
      if (this.onReady) this.onReady();
    }

    // dress + groom: hide the cowboy hat, tune skin + outfit
    styleMarcus(model) {
      model.traverse((o) => {
        if (!o.isMesh) return;
        if (o.name === 'Wolf3D_Headwear') o.visible = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mt of mats) {
          if (!mt) continue;
          if (mt.name === 'Wolf3D_Skin' || mt.name === 'Wolf3D_Body') {
            mt.color.setHex(0x8a5a40);
            mt.roughness = 0.62;
          }
          if (mt.name === 'Wolf3D_Beard') mt.color.setHex(0x3a2a20);
          if (mt.envMapIntensity !== undefined) mt.envMapIntensity = 0.9;
        }
      });
    }

    // gold Cuban chain, gold-rim glasses, diamond studs, gold watch — built in rest pose, then parented to bones
    buildAccessories() {
      const B = this.B, X = this.mat, rq = this.rootQ;
      const wp = (b) => b.getWorldPosition(new THREE.Vector3());
      const charV = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(rq);
      const framed = (pos) => {
        const g = new THREE.Group();
        g.position.copy(pos);
        g.quaternion.copy(rq);
        this.parent.add(g);
        g.updateMatrixWorld(true);
        return g;
      };

      // eyes: centre + radius from the eye meshes
      const eyeInfo = [];
      this.model.traverse((o) => {
        if (o.isMesh && (o.name === 'EyeLeft' || o.name === 'EyeRight')) {
          o.geometry.computeBoundingSphere();
          const bs = o.geometry.boundingSphere;
          const ws = o.getWorldScale(new THREE.Vector3());
          eyeInfo.push({ name: o.name, c: bs.center.clone().applyMatrix4(o.matrixWorld), r: bs.radius * ws.x });
        }
      });
      if (eyeInfo.length === 2 && B.Head) {
        const eL = eyeInfo.find((e) => e.name === 'EyeLeft'), eR = eyeInfo.find((e) => e.name === 'EyeRight');
        const r = clamp((eL.r + eR.r) / 2, 0.009, 0.016);
        this.eyeR = r;
        const mid = eL.c.clone().add(eR.c).multiplyScalar(0.5);
        const half = eL.c.distanceTo(eR.c) / 2;

        // --- glasses ---
        const glasses = framed(mid.clone().add(charV(0, 0.002, r + 0.017)));
        const ringR = Math.max(0.022, half * 0.72);
        const lensMat = new THREE.MeshPhysicalMaterial({
          color: 0xffc98a, roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, envMapIntensity: 2, depthWrite: false
        });
        for (const sx of [1, -1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.0017, 8, 44), X.gold);
          ring.position.set(sx * half, 0, 0);
          glasses.add(ring);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(ringR, 32), lensMat);
          lens.position.copy(ring.position);
          lens.renderOrder = 4;
          glasses.add(lens);
          const tLen = 0.1;
          const temple = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, tLen, 6), X.gold);
          temple.rotation.x = Math.PI / 2 + 0.08;
          temple.position.set(sx * (half + ringR + 0.006), 0.004, -tLen / 2 + 0.004);
          glasses.add(temple);
          const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.004), X.gold);
          hinge.position.set(sx * (half + ringR + 0.003), 0.004, 0);
          glasses.add(hinge);
        }
        const bridge = new THREE.Mesh(new THREE.TorusGeometry(half - ringR, 0.0015, 6, 16, Math.PI), X.gold);
        bridge.position.set(0, 0.004, 0.001);
        glasses.add(bridge);
        B.Head.attach(glasses);

        // --- diamond studs (ears sit behind + below the eyes, at the head's widest point) ---
        let headMesh = null;
        this.model.traverse((o) => { if (o.isMesh && o.name === 'Wolf3D_Head') headMesh = o; });
        if (headMesh) {
          headMesh.geometry.computeBoundingBox();
          const bb = headMesh.geometry.boundingBox;
          const ws = headMesh.getWorldScale(new THREE.Vector3());
          const halfW = ((bb.max.x - bb.min.x) / 2) * ws.x;
          const diamond = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0, metalness: 0.1, clearcoat: 1, emissive: 0x334455, envMapIntensity: 4 });
          const studs = framed(mid.clone().add(charV(0, -0.035, -0.088)));
          for (const sx of [1, -1]) {
            const stud = new THREE.Mesh(new THREE.OctahedronGeometry(0.0045, 0), diamond);
            stud.position.set(sx * (halfW * 0.94), 0, 0);
            studs.add(stud);
          }
          B.Head.attach(studs);
        }

        // --- eyelids: skin caps that roll down over each eyeball ---
        const lidMat = new THREE.MeshStandardMaterial({ color: 0x5e3a28, roughness: 0.7 });
        this.lids = [];
        for (const e of [eL, eR]) {
          const pivot = framed(e.c);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 1.07, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
          pivot.add(cap);
          B.Head.attach(pivot);
          this.lids.push(cap);
        }
      }

      // --- gold Cuban link chain resting on the collarbones ---
      if (B.Neck && B.Spine2) {
        const base = wp(B.Neck).add(charV(0, -0.035, 0.012));
        const chain = framed(base);
        const links = 46;
        const linkGeo = new THREE.TorusGeometry(0.0072, 0.0026, 6, 12);
        const inst = new THREE.InstancedMesh(linkGeo, X.gold, links);
        const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), pos = new THREE.Vector3(), tan = new THREE.Vector3();
        const pt = (a, out) => {
          const front = Math.max(0, Math.sin(a));
          return out.set(Math.cos(a) * 0.082, -0.07 * Math.pow(front, 1.6), Math.sin(a) * (a > 0 && a < Math.PI ? 0.085 : 0.06));
        };
        for (let i = 0; i < links; i++) {
          const a = (i / links) * Math.PI * 2;
          pt(a, pos);
          pt(a + 0.02, tan).sub(pos).normalize();
          q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tan);
          qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), i % 2 ? Math.PI / 2 : 0.25);
          q.multiply(qa);
          mtx.compose(pos, q, new THREE.Vector3(1, 1, 1));
          inst.setMatrixAt(i, mtx);
        }
        inst.castShadow = true;
        chain.add(inst);
        B.Spine2.attach(chain);
      }

      // --- gold watch on the left wrist ---
      if (B.LeftHand && B.LeftForeArm) {
        const wrist = wp(B.LeftHand), elbow = wp(B.LeftForeArm);
        const axis = wrist.clone().sub(elbow).normalize();
        const at = wrist.clone().addScaledVector(axis, -0.035);
        const watch = new THREE.Group();
        watch.position.copy(at);
        watch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
        this.parent.add(watch);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0065, 8, 32), X.gold);
        watch.add(band);
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.008, 28), X.gold);
        const up = new THREE.Vector3(0, 1, 0);
        face.position.copy(up.clone().multiplyScalar(0.033).applyQuaternion(watch.quaternion.clone().invert()));
        watch.add(face);
        watch.updateMatrixWorld(true);
        B.LeftForeArm.attach(watch);
      }
    }

    // ============================================================
    // PUBLIC API (used by marcus.js)
    // ============================================================
    setMode(mode) {
      if (mode === this.mode) return;
      if (this.mode === 'speaking' && mode !== 'speaking') this.reactUntil = this.now + 3.5;
      this.mode = mode;
    }

    setEmotion(name) {
      if (!EMOTIONS[name]) name = 'calm';
      this.emotion = name;
      const e = EMOTIONS[name];
      if (e.gesture) this.gesture(e.gesture);
    }

    setEngaged(on) {
      this.engaged = on;
      this.idleUntil = 0;
    }

    gesture(name) {
      const t = this.now || 0;
      const dur = { nod: 1.3, shake: 1.4, tilt: 1.8, chuckle: 1.3, wave: 2.2, celebrate: 1.8, shrug: 1.6 }[name] || 1.2;
      this.gestures.push({ name, t0: t, dur });
      if (name === 'wave' || name === 'celebrate' || name === 'shrug') {
        this.gesturePose = name;
        this.gesturePoseUntil = t + dur;
      }
    }

    greet() {
      this.gesture('wave');
      this.setEmotion('calm');
      this.face && (this.face.smileBoost = 0.45);
    }

    // ============================================================
    // FRAME UPDATE
    // ============================================================
    update(t, dt, camera) {
      this.now = t;
      dt = Math.min(dt || 0.016, 0.05);
      this.updateLights(dt);
      if (!this.ready) return;
      // skip the heavy rig work when he's far off-screen
      const camDist = camera.position.distanceTo(this.root.position);
      if (camDist > 30 && !this.engaged) return;
      this.updateBehaviour(t, dt);
      this.applySkeleton(t, dt, camera);
      this.updateFace(t, dt);
      this.updateTowel();
    }

    updateBehaviour(t, dt) {
      const emo = EMOTIONS[this.emotion] || EMOTIONS.calm;
      let pose, smile;
      if (this.mode === 'speaking') {
        pose = emo.pose === 'think' ? 'explain' : emo.pose;
        smile = emo.smile;
      } else if (this.mode === 'thinking') {
        pose = 'think';
        smile = 0.05;
      } else if (this.mode === 'listening') {
        pose = 'lean';
        smile = 0.24;
      } else {
        if (t > this.idleUntil) {
          const routine = this.engaged
            ? [['lean', 7, 12], ['wipe', 5, 8], ['lean', 6, 10], ['crossed', 5, 8]]
            : [['wipe', 8, 14], ['crossed', 6, 10], ['relaxed', 5, 8], ['lean', 5, 9]];
          this.idleIdx = ((this.idleIdx || 0) + 1) % routine.length;
          const r = routine[this.idleIdx];
          this.idlePose = r[0];
          this.idleUntil = t + r[1] + Math.random() * (r[2] - r[1]);
        }
        pose = this.idlePose;
        smile = pose === 'wipe' ? 0.06 : 0.16;
        if (t < this.reactUntil) {
          pose = emo.pose === 'think' ? 'lean' : emo.pose;
          smile = emo.smile;
        }
      }
      if (this.gesturePose && t < this.gesturePoseUntil) pose = this.gesturePose;
      this.poseName = pose;
      this.targetSmile = smile;
    }

    // ---------- bone helpers ----------
    rotW(bone, axisW, angle) {
      if (!bone || !angle) return;
      const q = this._q[0].setFromAxisAngle(axisW, angle);
      const w = bone.getWorldQuaternion(this._q[1]).premultiply(q);
      const pInv = bone.parent.getWorldQuaternion(this._q[2]).invert();
      bone.quaternion.copy(pInv.multiply(w));
    }

    rotC(bone, ax, angle) {
      if (!bone || !angle) return;
      const axis = this._v[6].set(ax === 0 ? 1 : 0, ax === 1 ? 1 : 0, ax === 2 ? 1 : 0).applyQuaternion(this.rootQ);
      this.rotW(bone, axis, angle);
    }

    aim(bone, child, dirW, maxAngle) {
      if (!bone || !child) return;
      const a = bone.getWorldPosition(this._v[0]);
      const b = child.getWorldPosition(this._v[1]);
      const cur = b.sub(a).normalize();
      const q = this._q[3].setFromUnitVectors(cur, dirW);
      if (maxAngle) {
        const ang = 2 * Math.acos(clamp(q.w, -1, 1));
        if (ang > maxAngle) q.slerp(this._qI || (this._qI = new THREE.Quaternion()), 1 - maxAngle / ang);
      }
      const w = bone.getWorldQuaternion(this._q[1]).premultiply(q);
      const pInv = bone.parent.getWorldQuaternion(this._q[2]).invert();
      bone.quaternion.copy(pInv.multiply(w));
    }

    palmNow(s, out) {
      const hq = s.Hand.getWorldQuaternion(this._q[1]);
      const d = hq.multiply(this._q[2].copy(s.Hand.userData.restW).invert());
      return out.copy(s.palmRest).applyQuaternion(d);
    }

    twistTo(bone, s, axisW, desiredW, gain, limit) {
      const cur = this.palmNow(s, this._v[2]);
      const p1 = cur.addScaledVector(axisW, -cur.dot(axisW)).normalize();
      const p2 = this._v[3].copy(desiredW).addScaledVector(axisW, -desiredW.dot(axisW)).normalize();
      const ang = Math.atan2(this._v[4].copy(p1).cross(p2).dot(axisW), p1.dot(p2));
      this.rotW(bone, axisW, clamp(ang * gain, -limit, limit));
    }

    charPt(arr, out) {
      return this.root.localToWorld(out.set(arr[0], arr[1], arr[2]));
    }

    charDir(arr, out) {
      return out.set(arr[0], arr[1], arr[2]).normalize().applyQuaternion(this.rootQ);
    }

    // ---------- smoothed pose state ----------
    stepSide(cur, spec, k, dt, mod) {
      const e = ease(k, dt);
      for (const key of ['hand', 'pole', 'dir', 'palm']) {
        const tgt = spec[key];
        const m = mod && mod[key];
        for (let i = 0; i < 3; i++) cur[key][i] += (tgt[i] + (m ? m[i] : 0) - cur[key][i]) * e;
      }
      cur.curl += (spec.curl - cur.curl) * e;
    }

    applySkeleton(t, dt, camera) {
      const pose = POSES[this.poseName] || POSES.lean;
      const k = pose.k || 5;
      if (!this.side.L.cur) {
        for (const key of ['L', 'R']) {
          const s = pose[key];
          this.side[key].cur = { hand: s.hand.slice(), pole: s.pole.slice(), dir: s.dir.slice(), palm: s.palm.slice(), curl: s.curl };
        }
        this.body = { spine: pose.spine, shL: pose.sh[0], shR: pose.sh[1], hp: 0, hy: 0, hr: 0, look: pose.look, gx: 0, gy: 0 };
      }

      // dynamic layers on top of the base pose
      const lvl = this.speechLevel;
      const modL = {}, modR = {};
      if (this.poseName === 'wipe') {
        modR.hand = [Math.cos(t * 2.4) * 0.11, 0, Math.sin(t * 2.4) * 0.065];
      } else if (this.poseName === 'explain') {
        const amp = this.mode === 'speaking' ? 0.025 + lvl * 0.07 : 0.012;
        modL.hand = [Math.sin(t * 2.1) * 0.03, Math.sin(t * 4.7 + 0.4) * amp, Math.sin(t * 1.7) * 0.02];
        modR.hand = [Math.sin(t * 1.9 + 1.2) * 0.03, Math.sin(t * 5.3 + 1.7) * amp, Math.sin(t * 1.5 + 0.8) * 0.02];
      } else if (this.poseName === 'wave') {
        modR.hand = [Math.sin(t * 10) * 0.07, 0, 0];
        modR.dir = [Math.sin(t * 10) * 0.35, 0, 0];
      } else if (this.poseName === 'celebrate') {
        modR.hand = [0, Math.abs(Math.sin(t * 7)) * 0.06, 0];
      } else if (this.poseName === 'lean' && this.mode === 'speaking') {
        // one hand lifts off the counter to talk
        modR.hand = [0.04, 0.12 + lvl * 0.08 + Math.sin(t * 4.1) * 0.02, -0.05];
        modR.palm = [0.4, 1.4, 0];
      }
      this.stepSide(this.side.L.cur, pose.L, k, dt, modL);
      this.stepSide(this.side.R.cur, pose.R, k, dt, modR);

      const b = this.body, e = ease(4, dt);
      b.spine += (pose.spine - b.spine) * e;
      b.shL += (pose.sh[0] - b.shL) * e;
      b.shR += (pose.sh[1] - b.shR) * e;
      const emo = EMOTIONS[this.emotion] || EMOTIONS.calm;
      const tilt = (this.mode === 'speaking' || t < this.reactUntil) ? emo.tilt : (this.mode === 'listening' ? 0.07 : 0);
      b.hp += (pose.head[0] - b.hp) * e;
      b.hy += (pose.head[1] - b.hy) * e;
      b.hr += (pose.head[2] + tilt - b.hr) * e;
      let look = pose.look;
      if (this.poseName === 'wipe') {
        if (t > this.nextGlance) {
          this.glanceUntil = t + 1.1 + Math.random() * 0.8;
          this.nextGlance = t + 3 + Math.random() * 4;
        }
        if (t < this.glanceUntil) look = 0.9;
      }
      if (!this.engaged && this.poseName !== 'wipe') look *= 0.6;
      b.look += (look - b.look) * ease(3, dt);
      const gz = pose.gaze || [0, 0];
      b.gx += (gz[0] - b.gx) * e;
      b.gy += (gz[1] - b.gy) * e;

      // ---- restore rest pose ----
      for (const bone of this.animBones) bone.quaternion.copy(bone.userData.rest);
      this.root.updateMatrixWorld(true);

      // ---- gestures (additive) ----
      let gP = 0, gY = 0, gR = 0, gSh = 0, gSp = 0;
      this.gestures = this.gestures.filter((g) => t - g.t0 < g.dur);
      for (const g of this.gestures) {
        const u = (t - g.t0) / g.dur;
        const env = Math.sin(Math.PI * u);
        if (g.name === 'nod') gP += Math.sin(u * Math.PI * 4) * 0.09 * env;
        if (g.name === 'shake') gY += Math.sin(u * Math.PI * 5) * 0.12 * env;
        if (g.name === 'tilt') gR += 0.1 * env;
        if (g.name === 'chuckle') { gSh += Math.abs(Math.sin(u * Math.PI * 7)) * 0.035 * env; gSp += Math.abs(Math.sin(u * Math.PI * 7)) * 0.03 * env; gP -= 0.06 * env; }
        if (g.name === 'shrug') gSh += 0.03 * env;
      }
      // speech: tiny emphasis nods riding the voice
      if (this.mode === 'speaking') gP += (lvl - 0.25) * 0.05 + Math.sin(t * 3.3) * 0.012;

      // ---- spine: lean + breathing + weight shift + slight turn toward the guest ----
      const breath = Math.sin(t * 1.45);
      const sway = Math.sin(t * 0.37) * 0.018;
      const spine = b.spine + breath * 0.012 + gSp;
      let bodyYaw = 0;
      if (this.engaged) {
        const camL = this.root.worldToLocal(this._v[5].copy(camera.position));
        bodyYaw = clamp(Math.atan2(camL.x, camL.z), -0.35, 0.35) * 0.45;
      }
      for (const [name, w] of [['Spine', 0.3], ['Spine1', 0.35], ['Spine2', 0.35]]) {
        const bone = this.B[name];
        this.rotC(bone, 0, spine * w);
        this.rotC(bone, 1, bodyYaw * w);
        this.rotC(bone, 2, sway * w);
      }
      const shBreath = (breath + 1) * 0.008;
      this.rotC(this.side.L.Shoulder, 2, b.shL + shBreath + gSh);
      this.rotC(this.side.R.Shoulder, 2, -(b.shR + shBreath + gSh));

      // ---- arms ----
      this.solveArm('L');
      this.solveArm('R');

      // ---- neck + head: look at the guest ----
      this.updateLook(t, dt, camera, b.look);
      this.rotC(this.B.Head, 0, b.hp + gP);
      this.rotC(this.B.Head, 1, b.hy + gY);
      this.rotC(this.B.Head, 2, b.hr + gR);

      // ---- eyes ----
      this.updateEyes(t, camera, b);
    }

    solveArm(key) {
      const s = this.side[key], c = s.cur;
      if (!s.Arm || !s.ForeArm || !s.Hand) return;
      const S = s.Arm.getWorldPosition(this._v[0]).clone();
      const T = this.charPt(c.hand, new THREE.Vector3());
      const pole = this.charDir(c.pole, new THREE.Vector3());
      const d = T.clone().sub(S);
      const len = Math.max(1e-4, d.length());
      const dir = d.divideScalar(len);
      const dist = clamp(len, 0.06, (s.a + s.b) * 0.998);
      const cosA = clamp((s.a * s.a + dist * dist - s.b * s.b) / (2 * s.a * dist), -1, 1);
      const sinA = Math.sqrt(1 - cosA * cosA);
      const n = pole.clone().addScaledVector(dir, -pole.dot(dir));
      if (n.lengthSq() < 1e-6) n.set(0, -1, 0);
      n.normalize();
      const E = S.clone().addScaledVector(dir, s.a * cosA).addScaledVector(n, s.a * sinA);
      const Tc = S.clone().addScaledVector(dir, dist);

      this.aim(s.Arm, s.ForeArm, E.clone().sub(S).normalize());
      const foAxis = Tc.clone().sub(E).normalize();
      this.aim(s.ForeArm, s.Hand, foAxis);
      const palmW = this.charDir(c.palm, new THREE.Vector3());
      this.twistTo(s.ForeArm, s, foAxis, palmW, 0.7, 1.6);
      if (s.mid) {
        const hd = this.charDir(c.dir, new THREE.Vector3());
        this.aim(s.Hand, s.mid, hd, 1.3);
        const hp = s.Hand.getWorldPosition(this._v[0]);
        const ha = s.mid.getWorldPosition(this._v[1]).sub(hp).normalize().clone();
        this.twistTo(s.Hand, s, ha, palmW, 1, 0.7);
      }
      this.curlFingers(s, c.curl);
    }

    curlFingers(s, curl) {
      if (!s.mid) return;
      const palm = this.palmNow(s, new THREE.Vector3());
      const hp = s.Hand.getWorldPosition(new THREE.Vector3());
      const fdir = s.mid.getWorldPosition(new THREE.Vector3()).sub(hp).normalize();
      const axis = fdir.clone().cross(palm).normalize();
      const base = [0.55, 0.75, 0.55];
      for (const f of s.fingers) {
        const gain = FINGER_GAIN[f.name] || 1;
        f.bones.forEach((bone, i) => this.rotW(bone, axis, (0.12 + curl * 1.25) * base[i] * gain * 1.5));
      }
      if (s.thumb.length) {
        const tAxis = palm.clone().cross(fdir).normalize();
        this.rotW(s.thumb[0], fdir, (0.15 + curl * 0.35) * (s === this.side.L ? -1 : 1));
        this.rotW(s.thumb[1], axis, 0.1 + curl * 0.45);
        this.rotW(s.thumb[2], axis, 0.1 + curl * 0.5);
        void tAxis;
      }
    }

    updateLook(t, dt, camera, weight) {
      const head = this.B.Head, neck = this.B.Neck;
      if (!head) return;
      // where he wants to look: the guest's eyes, or a spot on the counter / up in thought
      const want = this._v[5];
      if (this.poseName === 'think') {
        this.charPt([0.5, 2.1, 1.2], want);
      } else if (this.poseName === 'wipe' && weight < 0.5) {
        this.charPt([-0.12, TOP, 0.5], want);
      } else {
        want.copy(camera.position);
        if (!this.engaged) want.lerp(this.charPt([0, 1.7, 3], this._v[4]), 0.4);
      }
      this.lookPoint.lerp(want, ease(4, dt));
      const hp = head.getWorldPosition(new THREE.Vector3());
      const desired = this.lookPoint.clone().sub(hp).normalize();
      const w = this.poseName === 'think' || this.poseName === 'wipe' ? 1 : clamp(weight, 0, 1);
      const fwdNow = (bone) => {
        const q = bone.getWorldQuaternion(new THREE.Quaternion()).multiply(bone.userData.restW.clone().invert());
        return this.fwdW.clone().applyQuaternion(q);
      };
      const rotTo = (bone, share, maxA) => {
        const f = fwdNow(bone);
        const q = new THREE.Quaternion().setFromUnitVectors(f, desired);
        let ang = 2 * Math.acos(clamp(q.w, -1, 1));
        if (ang < 1e-4) return;
        const axis = new THREE.Vector3(q.x, q.y, q.z).normalize();
        ang = Math.min(ang, maxA) * share * w;
        this.rotW(bone, axis, ang);
      };
      if (neck) rotTo(neck, 0.4, 0.9);
      rotTo(head, 1, 0.75);
    }

    updateEyes(t, camera, b) {
      const eyes = [this.B.LeftEye, this.B.RightEye].filter(Boolean);
      if (!eyes.length) return;
      if (t > this.nextSaccade) {
        this.saccade.set((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.035);
        this.nextSaccade = t + 0.4 + Math.random() * 1.8;
      }
      for (const eye of eyes) {
        const ep = eye.getWorldPosition(new THREE.Vector3());
        const target = this.lookPoint.clone();
        const desired = target.sub(ep).normalize();
        // thinking: eyes drift up and away
        const side = this.charDir([1, 0, 0], new THREE.Vector3());
        const up = new THREE.Vector3(0, 1, 0);
        desired.addScaledVector(side, b.gx + this.saccade.x).addScaledVector(up, b.gy + this.saccade.y).normalize();
        const q = eye.getWorldQuaternion(new THREE.Quaternion()).multiply(eye.userData.restW.clone().invert());
        const fwd = this.fwdW.clone().applyQuaternion(q);
        const dq = new THREE.Quaternion().setFromUnitVectors(fwd, desired);
        let ang = 2 * Math.acos(clamp(dq.w, -1, 1));
        if (ang < 1e-4) continue;
        const axis = new THREE.Vector3(dq.x, dq.y, dq.z).normalize();
        this.rotW(eye, axis, Math.min(ang, 0.42));
      }
    }

    updateFace(t, dt) {
      const f = this.face;
      // blinking (natural rhythm + occasional double blink)
      if (this.blinkT < 0 && t > this.nextBlink) {
        this.blinkT = 0;
        this.blinkDouble = Math.random() < 0.15;
        this.nextBlink = t + 2.2 + Math.random() * 3.8;
      }
      let blink = 0;
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const d = 0.2;
        const u = this.blinkT / d;
        blink = u < 0.45 ? u / 0.45 : 1 - (u - 0.45) / 0.55;
        if (u >= 1) {
          if (this.blinkDouble) { this.blinkT = 0; this.blinkDouble = false; } else this.blinkT = -1;
          blink = 0;
        }
      }
      const lowered = this.poseName === 'wipe' && this.body.look < 0.5 ? 0.35 : 0;
      const lidBase = this.poseName === 'think' ? -0.05 : lowered;
      f.blink = Math.max(blink, lidBase);
      if (this.lids) {
        const open = -0.55, closed = 1.5;
        for (const lid of this.lids) lid.rotation.x = open + (closed - open) * clamp(f.blink, 0, 1);
      }

      // smile + lip-sync
      let smileT = this.targetSmile;
      if (f.smileBoost) {
        smileT += f.smileBoost;
        f.smileBoost = Math.max(0, f.smileBoost - dt * 0.15);
      }
      f.smile += (clamp(smileT, -0.4, 1) - f.smile) * ease(3.5, dt);
      const openT = this.mode === 'speaking' ? clamp(this.speechLevel * 1.15, 0, 0.85) : 0;
      f.open += (openT - f.open) * ease(openT > f.open ? 28 : 16, dt);
      for (const mo of this.morphs) {
        const inf = mo.mesh.morphTargetInfluences;
        if (mo.open !== undefined) inf[mo.open] = f.open;
        if (mo.smile !== undefined) inf[mo.smile] = f.smile * (1 - f.open * 0.4);
      }
    }

    updateTowel() {
      if (this.poseName !== 'wipe' || !this.side.R.Hand) return;
      const hp = this.side.R.Hand.getWorldPosition(this._v[0]);
      const tx = clamp(hp.x, BAR.x0 + 0.2, BAR.x1 - 0.2);
      const tz = clamp(hp.z - 0.02, BAR.cz0 - 0.05, BAR.cz1 - 0.02);
      this.towel.position.x += (tx - this.towel.position.x) * 0.5;
      this.towel.position.z += (tz - this.towel.position.z) * 0.5;
      this.towel.rotation.y = Math.sin(this.now * 2.4) * 0.15;
    }

    // world point just in front of Marcus's face (used by the camera)
    get headPoint() {
      return new THREE.Vector3(BAR.mx, this.f0 + 1.65, BAR.mz);
    }
  }

  CribBar.BAR = BAR;
  window.CribBar = CribBar;
})();
