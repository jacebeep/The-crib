/**
 * THA CRIB — Real-time 3D coastal estate (Three.js r128)
 *
 * Scene layout (meters, +z = inland, -z = ocean):
 *   - Physically based sunset sky (Sky.js) + reflective ocean (Water.js)
 *   - One continuous terrain: lawn -> dune -> beach -> sea floor
 *   - Modern white villa on a stone terrace, lap pool facing the sea
 *   - One consistent palm species (curved trunk, alpha-cut fronds, coconuts)
 *   - Short dense lawn grass + dry dune grass clumps (GPU wind)
 *   - Real CC0 PBR textures from Poly Haven, Ferrari from the three.js examples
 */
(function () {
  'use strict';

  const SEA_LEVEL = -4.0;

  // ---------- terrain math ----------
  function shoreZ(x) {
    return -52 + Math.sin(x * 0.018) * 5 + Math.sin(x * 0.051 + 1.3) * 2;
  }
  function hash(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function smoothstep(e0, e1, x) {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
    return t * t * (3 - 2 * t);
  }
  function groundHeight(x, z) {
    const d = z - shoreZ(x);
    if (d > 32) {
      const r = Math.hypot(x - 4, z - 2);
      return (vnoise(x * 0.04, z * 0.04) - 0.5) * 1.2 * smoothstep(45, 85, r) * smoothstep(32, 42, d);
    }
    if (d > 18) {
      return -2.4 + 2.4 * smoothstep(18, 32, d) +
        (vnoise(x * 0.15, z * 0.15) - 0.5) * 0.6 * Math.sin(Math.PI * (d - 18) / 14);
    }
    if (d > 0) return SEA_LEVEL + 1.6 * Math.pow(d / 18, 1.3);
    return SEA_LEVEL + Math.max(d * 0.12, -5);
  }
  // seeded random so the layout is identical every load
  let seed = 1337;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  // independent seeded generator for new details (keeps palm/grass layout unchanged)
  function makeRng(s) {
    s = Math.max(1, Math.floor(Math.abs(s)) % 2147483646);
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }
  const EASE = {
    inOutCubic: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
    inOutSine: (u) => -(Math.cos(Math.PI * u) - 1) / 2,
    outCubic: (u) => 1 - Math.pow(1 - u, 3)
  };

  class LuxuryMansion3D {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      if (!this.container) return;

      this.parallaxEnabled = true;
      this.targetMouseX = 0;
      this.targetMouseY = 0;
      this.mouseX = 0;
      this.mouseY = 0;
      this.palms = [];
      this.waterMesh = null; // pool water (toggled from settings)
      this.clock = new THREE.Clock();
      this.grassUniforms = { uTime: { value: 0 } };

      // entrance cinematic state
      this.mode = 'menu'; // 'menu' | 'cine' | 'inside'
      this.cine = null;
      this.now = 0;
      this.doorPivots = [];
      this.doorAngle = 0;
      this.doorOpenAngle = 1.6;
      this.doorTween = null;
      this.viewShiftFactor = 1;
      this.shiftTween = null;
      this.baseShift = 0;
      this.menuBlend = null;
      this.flickers = [];
      this.flames = [];
      this.bobbers = [];
      this._look = new THREE.Vector3();
      this._tmpPos = new THREE.Vector3();
      // where the camera stands in the foyer for profile selection (looking out to the ocean)
      this.insidePose = { pos: new THREE.Vector3(1.6, 1.65, 6.2), look: new THREE.Vector3(-2.5, 1.55, -8), sway: 1 };
      // facing the overview whiteboard on the west wall
      this.boardPose = { pos: new THREE.Vector3(-9.4, 2.1, 6.5), look: new THREE.Vector3(-13.7, 2.1, 6.5), sway: 0.3 };
      // sitting at "The Ledger" bar, across the counter from Marcus (framing depends on screen shape)
      this.barPose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), sway: 0.12 };
      this.updateBarPose();
      this.barReturnPose = null;
      this.lastT = 0;
      this.restPose = this.insidePose;

      this.initRenderer();
      this.initTextures();
      this.initSkyAndSun();
      this.buildOcean();
      this.buildTerrain();
      this.buildEstate();
      this.buildPalms();
      this.buildGrass();
      this.loadCar();

      window.addEventListener('resize', () => this.onResize());
      window.addEventListener('mousemove', (e) => {
        this.targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
        this.targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
      });

      this.onResize();
      this.animate = this.animate.bind(this);
      requestAnimationFrame(this.animate);
    }

    // ============================================================
    // RENDERER + CAMERA
    // ============================================================
    initRenderer() {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 900 ? 1.25 : 1.5));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.5;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.container.appendChild(this.renderer.domElement);

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0xd7a77e, 0.0009);

      this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.3, 20000);
      this.baseCamPos = new THREE.Vector3(46, 8.5, 40);
      this.camTarget = new THREE.Vector3(2, 3.2, -4);
      this.camera.position.copy(this.baseCamPos);
      this.camera.lookAt(this.camTarget);
      this._look.copy(this.camTarget);
    }

    // wide screens: Marcus sits left of centre (chat panel on the right); tall phones: he sits up top (chat below)
    updateBarPose() {
      const aspect = window.innerWidth / window.innerHeight;
      const p = this.barPose;
      if (aspect >= 1.05) {
        p.pos.set(-5.45, 2.02, 1.35);
        p.look.set(-6.2, 1.93, 3.62);
      } else {
        p.pos.set(-5.8, 2.06, 0.85);
        p.look.set(-5.8, 1.6, 3.62);
      }
    }

    onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      const aspect = w / h;
      if (this.barPose) this.updateBarPose();
      this.renderer.setSize(w, h);
      this.camera.aspect = aspect;
      // Tall phone screens: widen the vertical FOV so the house still fits side to side.
      const halfTan = Math.tan(THREE.MathUtils.degToRad(19));
      this.camera.fov = aspect < 1.2
        ? Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan((halfTan * 1.2) / aspect)))
        : 38;
      // Architectural "lens shift": push the house right so the menu on the left has room.
      this.baseShift = w > 900 ? -w * 0.13 : 0;
      // Portrait phones: lift the house into the top of the screen, above the menu at the bottom.
      this.baseShiftY = (w <= 600 && h > w) ? h * 0.14 : 0;
      this.applyViewOffset();
    }

    // lens shift is blended out during the entrance so the front door ends up centered
    applyViewOffset() {
      const w = window.innerWidth, h = window.innerHeight;
      const f = this.viewShiftFactor;
      this.camera.setViewOffset(w, h, this.baseShift * f, (this.baseShiftY || 0) * f, w, h);
      this.camera.updateProjectionMatrix();
    }

    // ============================================================
    // TEXTURES (real CC0 PBR sets from Poly Haven)
    // ============================================================
    initTextures() {
      const loader = new THREE.TextureLoader();
      const aniso = this.renderer.capabilities.getMaxAnisotropy();
      const load = (path, srgb) => {
        const t = loader.load(path);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        if (srgb) t.encoding = THREE.sRGBEncoding;
        return t;
      };
      const set = (name) => ({
        diff: load(`assets/tex/${name}_diff.jpg`, true),
        nor: load(`assets/tex/${name}_nor.jpg`, false),
        rough: load(`assets/tex/${name}_rough.jpg`, false)
      });

      this.tex = {
        grass: set('grass'),
        sand: set('sand'),
        bark: set('bark'),
        plaster: set('plaster'),
        pavers: set('pavers'),
        deck: set('deck'),
        pooltile: set('pooltile'),
        waterNormals: load('assets/waternormals.jpg', false),
        poolNormals: load('assets/waternormals.jpg', false),
        flare0: loader.load('assets/lensflare0.png'),
        flare3: loader.load('assets/lensflare3.png'),
        leaf: this.makeFrondTexture()
      };
      this.tex.poolNormals.repeat.set(3, 3);
      this.tex.flare0.encoding = THREE.sRGBEncoding;
      this.tex.flare3.encoding = THREE.sRGBEncoding;

      const pbr = (s, extra = {}) => new THREE.MeshStandardMaterial(Object.assign({
        map: s.diff, normalMap: s.nor, roughnessMap: s.rough, roughness: 1, metalness: 0
      }, extra));

      this.mat = {
        // white render: keep the real normal/roughness detail but not the grey albedo
        plaster: new THREE.MeshStandardMaterial({
          color: 0xf3efe6, normalMap: this.tex.plaster.nor, normalScale: new THREE.Vector2(0.45, 0.45),
          roughnessMap: this.tex.plaster.rough, roughness: 0.95, metalness: 0
        }),
        pavers: pbr(this.tex.pavers, { color: 0xd9d4cc }),
        deck: pbr(this.tex.deck, { color: 0xc9a47e }),
        pooltile: pbr(this.tex.pooltile, { color: 0xffffff }),
        hedge: pbr(this.tex.grass, { color: 0x4d6a34, normalScale: new THREE.Vector2(2, 2) }),
        coping: new THREE.MeshStandardMaterial({ color: 0xece7de, roughness: 0.55 }),
        frame: new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.35, metalness: 0.7 }),
        glass: new THREE.MeshPhysicalMaterial({
          color: 0xb7c8d2, roughness: 0.04, metalness: 0, transparent: true,
          opacity: 0.26, envMapIntensity: 2.4, depthWrite: false
        }),
        windowDark: new THREE.MeshPhysicalMaterial({
          color: 0x1c2228, roughness: 0.06, metalness: 0.2, envMapIntensity: 1.8, clearcoat: 1
        }),
        interior: new THREE.MeshStandardMaterial({
          color: 0xd6c3a5, roughness: 0.9, emissive: 0x2e1d0c, side: THREE.BackSide
        }),
        interiorFloor: pbr(this.tex.deck, { color: 0x9c7552, emissive: 0x1a1008 }),
        fabric: new THREE.MeshStandardMaterial({ color: 0xefe9de, roughness: 0.95 }),
        fabricDark: new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.95 }),
        warmLight: new THREE.MeshBasicMaterial({ color: 0xffd9a8 }),
        art: new THREE.MeshStandardMaterial({ color: 0xb7864d, roughness: 0.6, emissive: 0x3a2410 })
      };

      // extra materials for the entrance, interior and estate details
      Object.assign(this.mat, {
        interiorWall: new THREE.MeshStandardMaterial({ color: 0xe8dfcf, roughness: 0.9, emissive: 0x24170a }),
        door: pbr(this.tex.deck, { color: 0x6e4a2c, roughness: 0.8 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xd6b26a, roughness: 0.22, metalness: 1 }),
        stoneDark: pbr(this.tex.pavers, { color: 0x4a4540 }),
        trunk: pbr(this.tex.bark, { color: 0x9b8b76 }),
        soot: new THREE.MeshStandardMaterial({ color: 0x0c0b0a, roughness: 1 }),
        rug: new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 1 }),
        accent: new THREE.MeshStandardMaterial({ color: 0xb86a45, roughness: 0.9 }),
        pot: new THREE.MeshStandardMaterial({ color: 0x2b2826, roughness: 0.55, metalness: 0.1 }),
        foliage: new THREE.MeshStandardMaterial({ color: 0x4f6b35, roughness: 0.8, flatShading: true }),
        olive: new THREE.MeshStandardMaterial({ color: 0x7d8c5a, roughness: 0.85, flatShading: true }),
        canopy: new THREE.MeshStandardMaterial({ color: 0xf2e9d8, roughness: 0.95, side: THREE.DoubleSide }),
        waterDark: new THREE.MeshStandardMaterial({
          color: 0x0a2630, roughness: 0.04, metalness: 0.35, normalMap: this.tex.poolNormals,
          normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.7
        }),
        orb: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
        artA: this.makeArtMaterial(['#c2643f', '#d9a441', '#1f2d3d', '#e9dcc4'], 7),
        artB: this.makeArtMaterial(['#2e4a52', '#c9a46a', '#a34a32', '#efe6d6'], 19)
      });
      this.tex.flameWide = this.makeFlameTexture(512, 128, 14, 3);
      this.tex.flameTall = this.makeFlameTexture(256, 256, 6, 11);
      this.tex.sign = this.makeSignTexture();
    }

    // abstract canvas painting for the interior walls
    makeArtMaterial(palette, s) {
      const rng = makeRng(s);
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 384;
      const g = c.getContext('2d');
      g.fillStyle = palette[3];
      g.fillRect(0, 0, 512, 384);
      for (let i = 0; i < 9; i++) {
        g.globalAlpha = 0.55 + rng() * 0.45;
        g.fillStyle = palette[Math.floor(rng() * 3)];
        const x = rng() * 512, y = rng() * 384, r = 30 + rng() * 120;
        if (rng() < 0.5) {
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        } else {
          g.fillRect(x - r, y - r * 0.3, r * 2, r * 0.6);
        }
      }
      g.globalAlpha = 1;
      g.strokeStyle = palette[2];
      g.lineWidth = 3;
      g.beginPath();
      g.arc(256, 192, 140, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 });
    }

    // soft flame tongues (additive) for the fireplace and the fire pit
    makeFlameTexture(w, h, tongues, s) {
      const rng = makeRng(s);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < tongues; i++) {
        const cx = ((i + 0.5) / tongues) * w + (rng() - 0.5) * (w / tongues) * 0.6;
        const fw = (w / tongues) * (0.8 + rng() * 0.7);
        const fh = h * (0.55 + rng() * 0.42);
        const grad = g.createLinearGradient(0, h, 0, h - fh);
        grad.addColorStop(0, 'rgba(255,245,210,0.95)');
        grad.addColorStop(0.25, 'rgba(255,185,80,0.85)');
        grad.addColorStop(0.6, 'rgba(255,100,30,0.5)');
        grad.addColorStop(1, 'rgba(180,40,10,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(cx - fw / 2, h);
        g.quadraticCurveTo(cx - fw * 0.6, h - fh * 0.5, cx + (rng() - 0.5) * fw * 0.4, h - fh);
        g.quadraticCurveTo(cx + fw * 0.6, h - fh * 0.5, cx + fw / 2, h);
        g.closePath();
        g.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      return tex;
    }

    flameMaterial(tex) {
      return new THREE.MeshBasicMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      });
    }

    // brushed-gold "THA CRIB" address lettering for the entrance canopy
    makeSignTexture() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 96;
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 8;
      const draw = () => {
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        g.font = '700 62px Cinzel, Georgia, serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const grad = g.createLinearGradient(0, 10, 0, 86);
        grad.addColorStop(0, '#fff1c9');
        grad.addColorStop(0.5, '#d9b25c');
        grad.addColorStop(1, '#8c6a24');
        g.fillStyle = grad;
        g.fillText('T H A    C R I B', 512, 52);
        tex.needsUpdate = true;
      };
      draw();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
      return tex;
    }

    // world-scale UVs on a box so textures keep real size on any dimension
    boxUV(geo, w, h, d, tile) {
      const uv = geo.attributes.uv;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let i = 0; i < uv.count; i++) {
        const f = Math.floor(i / 4);
        uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
      }
      uv.needsUpdate = true;
    }

    slab(x0, x1, y0, y1, z0, z1, mat, tile = 2, parent = this.scene, shadows = true) {
      const w = x1 - x0, h = y1 - y0, d = z1 - z0;
      const geo = new THREE.BoxGeometry(w, h, d);
      this.boxUV(geo, w, h, d, tile);
      const m = new THREE.Mesh(geo, mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      parent.add(m);
      return m;
    }

    // ============================================================
    // SKY, SUN, LENS FLARE, IMAGE-BASED LIGHTING
    // ============================================================
    initSkyAndSun() {
      this.sky = new THREE.Sky();
      this.sky.scale.setScalar(10000);
      const u = this.sky.material.uniforms;
      u.turbidity.value = 10;
      u.rayleigh.value = 3.0;
      u.mieCoefficient.value = 0.005;
      u.mieDirectionalG.value = 0.86;
      this.scene.add(this.sky);

      // Sun sits just right of the view center, low over the sea (golden hour).
      const fwd = new THREE.Vector3().subVectors(this.camTarget, this.baseCamPos).setY(0).normalize();
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const az = THREE.MathUtils.degToRad(10);
      const el = THREE.MathUtils.degToRad(4);
      const hz = fwd.clone().multiplyScalar(Math.cos(az)).add(right.multiplyScalar(Math.sin(az))).normalize();
      this.sunDir = new THREE.Vector3(hz.x * Math.cos(el), Math.sin(el), hz.z * Math.cos(el)).normalize();
      u.sunPosition.value.copy(this.sunDir);

      // Physical sunlight
      this.sunLight = new THREE.DirectionalLight(0xffc690, 3.2);
      this.sunLight.position.copy(this.sunDir).multiplyScalar(140).add(new THREE.Vector3(6, 0, 0));
      this.sunLight.target.position.set(6, 0, 0);
      this.sunLight.castShadow = true;
      const sc = this.sunLight.shadow.camera;
      sc.left = -55; sc.right = 55; sc.top = 40; sc.bottom = -40; sc.near = 10; sc.far = 320;
      this.sunLight.shadow.mapSize.set(4096, 4096);
      this.sunLight.shadow.bias = -0.0004;
      this.sunLight.shadow.normalBias = 0.04;
      this.scene.add(this.sunLight, this.sunLight.target);

      this.scene.add(new THREE.HemisphereLight(0xb9c9e6, 0x6b5238, 0.35));

      // Real lens flare (occluded by the house/palms automatically)
      if (THREE.Lensflare) {
        this.lensflare = new THREE.Lensflare();
        this.lensflare.addElement(new THREE.LensflareElement(this.tex.flare0, 420, 0, new THREE.Color(0xffd7a0)));
        this.lensflare.addElement(new THREE.LensflareElement(this.tex.flare3, 50, 0.6));
        this.lensflare.addElement(new THREE.LensflareElement(this.tex.flare3, 70, 0.7));
        this.lensflare.addElement(new THREE.LensflareElement(this.tex.flare3, 110, 0.9));
        this.lensflare.addElement(new THREE.LensflareElement(this.tex.flare3, 60, 1.0));
        this.lensflare.position.copy(this.sunDir).multiplyScalar(9000);
        this.scene.add(this.lensflare);
      }

      // Image-based lighting from the sky: glass, car paint and pool reflect the real sunset
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(this.sky).texture;
    }

    // ============================================================
    // OCEAN (planar reflections + animated normals)
    // ============================================================
    buildOcean() {
      if (!THREE.Water) return;
      this.ocean = new THREE.Water(new THREE.PlaneGeometry(10000, 10000), {
        textureWidth: 1024,
        textureHeight: 1024,
        waterNormals: this.tex.waterNormals,
        sunDirection: this.sunDir.clone(),
        sunColor: 0xffe2b8,
        waterColor: 0x062f3d,
        distortionScale: 2.6,
        fog: true
      });
      this.ocean.rotation.x = -Math.PI / 2;
      this.ocean.position.y = SEA_LEVEL;
      this.ocean.material.uniforms.size.value = 2.2;
      this.scene.add(this.ocean);

      // Skip expensive / irrelevant objects in the reflection pass
      const original = this.ocean.onBeforeRender.bind(this.ocean);
      this.ocean.onBeforeRender = (renderer, scene, camera) => {
        if (this.grass) this.grass.visible = false;
        if (this.lensflare) this.lensflare.visible = false;
        original(renderer, scene, camera);
        if (this.grass) this.grass.visible = true;
        if (this.lensflare) this.lensflare.visible = true;
      };
    }

    // ============================================================
    // TERRAIN: lawn -> dune -> beach -> sea floor (one mesh, blended)
    // ============================================================
    buildTerrain() {
      const size = 800, seg = 400;
      const geo = new THREE.PlaneGeometry(size, size, seg, seg);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      const sandMix = new Float32Array(pos.count);

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        pos.setY(i, groundHeight(x, z));
        uv.setXY(i, x / 4, z / 4);
        sandMix[i] = 1 - smoothstep(25, 33, z - shoreZ(x));
      }
      geo.setAttribute('aSand', new THREE.BufferAttribute(sandMix, 1));
      geo.computeVertexNormals();

      const mat = new THREE.MeshStandardMaterial({
        map: this.tex.grass.diff,
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0
      });
      const sandTex = this.tex.sand.diff;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.sandMap = { value: sandTex };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float aSand;\nvarying float vSand;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSand = aSand;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D sandMap;\nvarying float vSand;')
          .replace('#include <map_fragment>', `
            vec4 gCol = mapTexelToLinear(texture2D(map, vUv));
            gCol.rgb *= vec3(0.78, 0.95, 0.62);
            vec4 sCol = mapTexelToLinear(texture2D(sandMap, vUv * 0.9));
            float n = texture2D(map, vUv * 0.061).g;
            float m = smoothstep(0.3, 0.7, vSand + (n - 0.5) * 0.6);
            diffuseColor *= mix(gCol, sCol, m);
          `);
      };

      const terrain = new THREE.Mesh(geo, mat);
      terrain.receiveShadow = true;
      this.scene.add(terrain);
    }

    // ============================================================
    // ESTATE: terrace, pool, villa, landscaping
    // ============================================================
    buildEstate() {
      const M = this.mat;
      const T = 0.45; // terrace top height

      // --- Stone terrace with a cut-out for the pool (pool: x 15..23, z -14..6) ---
      this.slab(-18, 15, 0 - 0.6, T, -16, 18, M.pavers, 2.4);
      this.slab(23, 29, -0.6, T, -16, 18, M.pavers, 2.4);
      this.slab(15, 23, -0.6, T, 6, 18, M.pavers, 2.4);
      this.slab(15, 23, -0.6, T, -16, -14, M.pavers, 2.4);

      // Pool coping (white stone lip)
      this.slab(14.6, 23.4, T, T + 0.05, 6, 6.4, M.coping, 1);
      this.slab(14.6, 23.4, T, T + 0.05, -14.4, -14, M.coping, 1);
      this.slab(14.6, 15, T, T + 0.05, -14, 6, M.coping, 1);
      this.slab(23, 23.4, T, T + 0.05, -14, 6, M.coping, 1);

      // Pool basin (inside-facing box = tiled walls + floor)
      const basinGeo = new THREE.BoxGeometry(8, 1.9, 20);
      this.boxUV(basinGeo, 8, 1.9, 20, 1.2);
      const basinMat = M.pooltile.clone();
      basinMat.side = THREE.BackSide;
      basinMat.color.set(0x8fd3e3);
      const basin = new THREE.Mesh(basinGeo, basinMat);
      basin.position.set(19, T - 0.95, -4);
      basin.receiveShadow = true;
      this.scene.add(basin);

      this.waterMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 20),
        new THREE.MeshStandardMaterial({
          color: 0x0f9fb8, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.5,
          normalMap: this.tex.poolNormals, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6
        })
      );
      this.waterMesh.rotation.x = -Math.PI / 2;
      this.waterMesh.position.set(19, T - 0.12, -4);
      this.scene.add(this.waterMesh);

      const poolLightA = new THREE.PointLight(0x7fe9ff, 1.4, 10, 2);
      poolLightA.position.set(19, -0.6, -9);
      const poolLightB = poolLightA.clone();
      poolLightB.position.set(19, -0.6, 1);
      this.scene.add(poolLightA, poolLightB);

      // Driveway + gentle ramp up to the motor court in front of the entrance
      this.slab(-2.5, 8.5, -0.3, 0.03, 22.4, 48, M.pavers, 2.4);
      const ramp = this.slab(-2.5, 8.5, -0.15, 0.15, 0, 4.6, M.pavers, 2.4);
      ramp.position.set(3, 0.08, 20.2);
      ramp.rotation.x = Math.atan2(0.45, 4.5);

      // Clipped hedges along the front edge of the terrace
      this.slab(-18, -3.2, 0, 1.0, 18.2, 19.1, M.hedge, 1.2);
      this.slab(9.7, 29, 0, 1.0, 18.2, 19.1, M.hedge, 1.2);

      this.buildVilla(T);
      this.buildLoungers(T);
      this.buildExteriorDetails(T);
    }

    buildVilla(T) {
      const M = this.mat;
      const villa = new THREE.Group();
      this.scene.add(villa);
      const S = (a, b, c, d, e, f, m, t) => this.slab(a, b, c, d, e, f, m, t, villa);

      // ---------- Ground floor: x -14..10, z -6..10, y T..4.05 ----------
      const g0 = T, g1 = 4.05;
      // interior shell: floor + ceiling (glass sides stay open so you can see out)
      this.interiorRoom(villa, -13.8, 9.8, g0 + 0.01, g1 - 0.05, -5.8, 9.8);
      // solid walls: west + inland (entrance) side, with a real opening for the double doors
      S(-14, -13.8, g0, g1, -6, 10, M.plaster, 2);
      S(-14, 0.9, g0, g1, 9.8, 10.05, M.plaster, 2);
      S(3.3, 10, g0, g1, 9.8, 10.05, M.plaster, 2);
      S(0.9, 3.3, 3.4, g1, 9.8, 10.05, M.plaster, 2);
      // warm interior linings on the solid walls
      this.lining(villa, -13.8, -13.74, g0, g1 - 0.05, -5.8, 9.74);
      this.lining(villa, -13.8, 0.9, g0, g1 - 0.05, 9.74, 9.8);
      this.lining(villa, 3.3, 9.8, g0, g1 - 0.05, 9.74, 9.8);
      this.lining(villa, 0.9, 3.3, 3.4, g1 - 0.05, 9.74, 9.8);
      // inland windows (dark reflective glass in bronze frames), both faces
      this.windowPanel(villa, -11.5, -4.5, 1.3, 3.5, 10.06);
      this.windowPanel(villa, 5.0, 8.8, 1.3, 3.5, 10.06);
      this.windowPanel(villa, -11.5, -4.5, 1.3, 3.5, 9.74, -1);
      this.windowPanel(villa, 5.0, 8.8, 1.3, 3.5, 9.74, -1);
      // full-height glazing facing the pool (+x) and the ocean (-z)
      this.glassWall(villa, 'x', 10, -6, 10, g0, g1, 3.2);
      this.glassWall(villa, 'z', -6, -14, 10, g0, g1, 3.4);

      // Entrance (double pivot doors, canopy, sign) + furnished interior
      this.buildEntrance(villa, g0);
      this.buildInterior(villa, g0, g1);

      // ---------- Floor slab between levels ----------
      S(-14.3, 10.3, g1, 4.45, -6.3, 10.3, M.plaster, 2);
      // cantilever floor extension over the terrace (x 10.3..13)
      S(10.3, 13, g1, 4.45, -4, 9, M.plaster, 2);
      // soffit downlights under the cantilever
      for (const z of [-2, 1.5, 5, 8]) S(11.4, 11.8, g1 - 0.01, g1, z - 0.2, z + 0.2, M.warmLight, 1);

      // ---------- Upper floor: x -10..13, z -4..9, y 4.45..7.65 ----------
      const u0 = 4.45, u1 = 7.65;
      this.interiorRoom(villa, -9.8, 12.8, u0 + 0.01, u1 - 0.05, -3.8, 8.8);
      S(-10, -9.8, u0, u1, -4, 9, M.plaster, 2);
      S(-10, 13, u0, u1, 8.8, 9.05, M.plaster, 2);
      this.lining(villa, -9.8, -9.74, u0, u1 - 0.05, -3.8, 8.74);
      this.lining(villa, -9.8, 12.8, u0, u1 - 0.05, 8.74, 8.8);
      this.windowPanel(villa, 3.2, 12.4, 5.3, 7.1, 8.74, -1);
      // vertical timber slats over the inland facade
      for (let x = -9.6; x < 2.6; x += 0.32) S(x, x + 0.14, u0 + 0.1, u1 - 0.1, 9.05, 9.2, M.deck, 1);
      this.windowPanel(villa, 3.2, 12.4, 5.3, 7.1, 9.06);
      this.glassWall(villa, 'x', 13, -4, 9, u0, u1, 3.25);
      this.glassWall(villa, 'z', -4, -10, 13, u0, u1, 3.3);
      S(9.0, 12.4, u0, u0 + 0.55, 2.0, 6.0, M.fabric, 1);      // bed
      S(12.2, 12.4, u0, u0 + 1.3, 2.0, 6.0, M.fabricDark, 1);  // headboard
      S(8.4, 12.7, u0 + 0.03, u0 + 0.042, 1.0, 7.0, M.rug, 1, false); // rug
      S(9.0, 11.2, u0 + 0.55, u0 + 0.62, 2.2, 5.8, M.accent, 1);      // throw
      for (const z of [1.2, 6.2]) {                              // nightstands + lamps
        S(11.7, 12.4, u0, u0 + 0.5, z, z + 0.6, M.door, 1);
        S(11.95, 12.15, u0 + 0.5, u0 + 0.85, z + 0.2, z + 0.4, M.warmLight, 1, false);
      }

      // ---------- Roof with thin overhang ----------
      S(-10.4, 13.4, u1, 8.0, -4.4, 9.4, M.plaster, 2);
      // glass balustrade on the lower roof terrace (ocean + west edges)
      const railMat = M.glass;
      S(-14.3, 10.3, 4.45, 5.45, -6.3, -6.22, railMat, 1);
      S(-14.3, -14.22, 4.45, 5.45, -6.3, 10.3, railMat, 1);
      S(-14.3, 10.3, 5.45, 5.5, -6.32, -6.2, M.frame, 1);
      S(-14.32, -14.2, 5.45, 5.5, -6.3, 10.3, M.frame, 1);

      // Interior lighting (warm, no shadows to keep it fast)
      const addLamp = (x, y, z, i) => {
        const l = new THREE.PointLight(0xffc58a, i, 16, 2);
        l.position.set(x, y, z);
        villa.add(l);
      };
      addLamp(6, 3.4, 1, 2.2);
      addLamp(-5, 3.4, 2, 1.6);
      addLamp(9, 6.9, 3, 2.0);
      addLamp(-2, 6.9, 2, 1.4);

      villa.traverse((o) => {
        if (o.isMesh && (o.material === M.glass || o.material === M.warmLight)) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
    }

    // floor + warm ceiling with recessed downlights (walls are added explicitly per side)
    interiorRoom(parent, x0, x1, y0, y1, z0, z1) {
      const M = this.mat;
      const floor = this.slab(x0, x1, y0, y0 + 0.02, z0, z1, M.interiorFloor, 1.5, parent, false);
      floor.receiveShadow = true; // sun patches through the glass
      this.slab(x0, x1, y1 - 0.04, y1, z0, z1, M.interiorWall, 2, parent, false);
      for (let x = x0 + 2; x < x1 - 1; x += 4) {
        for (let z = z0 + 2; z < z1 - 1; z += 4) {
          this.slab(x - 0.12, x + 0.12, y1 - 0.045, y1 - 0.04, z - 0.12, z + 0.12, M.warmLight, 1, parent, false);
        }
      }
      return floor;
    }

    // interior wall finish (receives shadows, never casts)
    lining(parent, x0, x1, y0, y1, z0, z1) {
      const m = this.slab(x0, x1, y0, y1, z0, z1, this.mat.interiorWall, 2, parent, false);
      m.receiveShadow = true;
      return m;
    }

    // framed artwork: local +z is the facing direction
    artPanel(parent, mat, w, h, x, y, z, rotY) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY;
      parent.add(g);
      this.slab(-w / 2 - 0.05, w / 2 + 0.05, -h / 2 - 0.05, h / 2 + 0.05, -0.03, 0, this.mat.gold, 1, g, false);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p.position.z = 0.003;
      g.add(p);
    }

    // ============================================================
    // ENTRANCE: double walnut pivot doors, canopy, address sign
    // ============================================================
    buildEntrance(villa, g0) {
      const M = this.mat;
      const S = (a, b, c, d, e, f, m, t = 1, sh = true) => this.slab(a, b, c, d, e, f, m, t, villa, sh);
      const dx0 = 0.9, dx1 = 3.3, dTop = 3.4;

      // bronze frame + stone threshold
      S(dx0, dx0 + 0.08, g0, dTop, 9.72, 10.1, M.frame);
      S(dx1 - 0.08, dx1, g0, dTop, 9.72, 10.1, M.frame);
      S(dx0, dx1, dTop - 0.08, dTop, 9.72, 10.1, M.frame);
      S(0.5, 3.7, g0, g0 + 0.05, 9.72, 11.2, M.coping, 1);

      // two leaves hinged at the jambs, swinging inward
      const leafW = (dx1 - dx0 - 0.16) / 2, y0 = g0 + 0.05, y1 = dTop - 0.08;
      [[dx0 + 0.08, 1], [dx1 - 0.08, -1]].forEach(([hx, dir]) => {
        const pivot = new THREE.Group();
        pivot.position.set(hx, 0, 9.91);
        villa.add(pivot);
        const a = dir > 0 ? 0 : -leafW, b = dir > 0 ? leafW : 0;
        this.slab(a, b, y0, y1, -0.045, 0.045, M.door, 1.2, pivot);
        // brass inlay lines on both faces
        for (const gy of [1.25, 2.05, 2.85]) {
          this.slab(a + 0.08, b - 0.08, gy, gy + 0.018, 0.045, 0.05, M.gold, 1, pivot, false);
          this.slab(a + 0.08, b - 0.08, gy, gy + 0.018, -0.05, -0.045, M.gold, 1, pivot, false);
        }
        // tall brass pulls near the meeting edge
        const px = dir * (leafW - 0.14);
        for (const side of [1, -1]) {
          const z0 = side > 0 ? 0.06 : -0.11, z1 = side > 0 ? 0.11 : -0.06;
          this.slab(px - 0.025, px + 0.025, 0.95, 2.75, z0, z1, M.gold, 1, pivot);
          for (const py of [1.0, 2.7]) {
            const s0 = side > 0 ? 0.045 : -0.06, s1 = side > 0 ? 0.06 : -0.045;
            this.slab(px - 0.015, px + 0.015, py - 0.015, py + 0.015, s0, s1, M.gold, 1, pivot, false);
          }
        }
        this.doorPivots.push({ pivot, dir });
      });

      // wall sconces either side of the door
      S(0.3, 0.42, 2.45, 3.05, 10.05, 10.2, M.warmLight, 1, false);
      S(3.78, 3.9, 2.45, 3.05, 10.05, 10.2, M.warmLight, 1, false);

      // floating canopy with downlights
      S(-0.6, 4.8, 3.5, 3.8, 10.05, 12.8, M.plaster, 2);
      for (const x of [0.5, 2.1, 3.7]) S(x - 0.14, x + 0.14, 3.485, 3.5, 11.66, 11.94, M.warmLight, 1, false);

      // gold address lettering on the canopy fascia
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 0.3),
        new THREE.MeshStandardMaterial({
          map: this.tex.sign, transparent: true, depthWrite: false, metalness: 0.7, roughness: 0.3,
          emissive: 0xffffff, emissiveMap: this.tex.sign, emissiveIntensity: 0.45
        })
      );
      sign.position.set(2.1, 3.65, 12.806);
      villa.add(sign);

      // potted olive trees flanking the entrance
      this.oliveTree(villa, -0.45, g0, 11.3);
      this.oliveTree(villa, 4.65, g0, 11.3);
    }

    oliveTree(parent, x, y, z) {
      const M = this.mat;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.slab(-0.42, 0.42, 0, 0.7, -0.42, 0.42, M.stoneDark, 1, g);
      this.slab(-0.36, 0.36, 0.7, 0.72, -0.36, 0.36, M.soot, 1, g, false);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.3, 7), M.trunk);
      trunk.position.y = 1.35;
      trunk.rotation.z = 0.06;
      trunk.castShadow = true;
      g.add(trunk);
      const rng = makeRng(x * 100 + z * 7 + 99);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + rng() * 0.16, 1), M.olive);
        const a = rng() * Math.PI * 2, r = rng() * 0.32;
        leaf.position.set(Math.cos(a) * r, 2.1 + rng() * 0.45, Math.sin(a) * r);
        leaf.scale.y = 0.8;
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        g.add(leaf);
      }
    }

    plant(parent, x, y, z, h = 1.5) {
      const M = this.mat;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.55, 18), M.pot);
      pot.position.y = 0.275;
      pot.castShadow = true;
      pot.receiveShadow = true;
      g.add(pot);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h - 0.5, 5), M.trunk);
      stem.position.y = 0.55 + (h - 0.5) / 2;
      g.add(stem);
      const rng = makeRng(x * 31 + z * 17 + 5);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + rng() * 0.12, 0), M.foliage);
        const a = rng() * Math.PI * 2, r = 0.05 + rng() * 0.18;
        leaf.position.set(Math.cos(a) * r, 0.75 + (i / 7) * (h - 0.7), Math.sin(a) * r);
        leaf.rotation.set(rng() * 3, rng() * 3, 0);
        leaf.castShadow = true;
        g.add(leaf);
      }
    }

    // ============================================================
    // INTERIOR: living, dining, kitchen, fireplace, chandelier
    // ============================================================
    buildInterior(villa, g0, g1) {
      const M = this.mat;
      const S = (a, b, c, d, e, f, m, t = 1, sh = true) => this.slab(a, b, c, d, e, f, m, t, villa, sh);
      const f0 = g0 + 0.03; // finished floor
      const ceil = g1 - 0.09;

      // --- Living: L-shaped sofa facing the ocean glass ---
      S(4.3, 9.7, f0, f0 + 0.012, -5.5, -0.5, M.rug, 1, false).receiveShadow = true;
      S(4.8, 9.3, f0, f0 + 0.42, -2.4, -1.4, M.fabric);
      S(4.8, 9.7, f0, f0 + 0.85, -1.4, -0.95, M.fabric);
      S(4.8, 5.1, f0, f0 + 0.62, -2.4, -1.4, M.fabric);
      S(8.3, 9.3, f0, f0 + 0.42, -5.3, -2.4, M.fabric);
      S(9.3, 9.7, f0, f0 + 0.85, -5.3, -0.95, M.fabric);
      S(5.4, 5.95, f0 + 0.42, f0 + 0.8, -1.45, -1.25, M.accent);
      S(8.6, 9.25, f0 + 0.42, f0 + 0.8, -1.5, -1.3, M.fabricDark);
      S(9.05, 9.28, f0 + 0.42, f0 + 0.8, -4.2, -3.6, M.accent);
      S(5.6, 7.8, f0, f0 + 0.3, -4.5, -3.3, M.stoneDark, 1.5);   // coffee table
      S(6.0, 6.5, f0 + 0.3, f0 + 0.36, -4.2, -3.8, M.gold);       // coffee-table books
      const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.42, 16), M.coping);
      vase.position.set(7.2, f0 + 0.51, -3.9);
      vase.castShadow = true;
      villa.add(vase);

      // --- Dining: walnut table, six chairs, linear pendant ---
      S(-6.3, -1.7, f0 + 0.72, f0 + 0.78, -3.0, -1.2, M.door, 1.2);
      S(-5.9, -5.75, f0, f0 + 0.72, -2.7, -1.5, M.frame);
      S(-2.25, -2.1, f0, f0 + 0.72, -2.7, -1.5, M.frame);
      for (const x of [-5.3, -4.0, -2.7]) {
        for (const side of [-1, 1]) {
          const zc = side < 0 ? -3.45 : -0.75;
          S(x - 0.23, x + 0.23, f0 + 0.42, f0 + 0.48, zc - 0.23, zc + 0.23, M.fabric);
          const b0 = side < 0 ? zc - 0.23 : zc + 0.17;
          S(x - 0.23, x + 0.23, f0 + 0.48, f0 + 0.98, b0, b0 + 0.06, M.door);
          S(x - 0.03, x + 0.03, f0, f0 + 0.42, zc - 0.03, zc + 0.03, M.frame);
        }
      }
      S(-5.6, -2.4, 2.72, 2.78, -2.14, -2.06, M.warmLight, 1, false);
      S(-5.65, -2.35, 2.78, 2.84, -2.16, -2.04, M.frame, 1, false);
      for (const x of [-5.4, -2.6]) S(x - 0.008, x + 0.008, 2.84, ceil, -2.108, -2.092, M.frame, 1, false);

      // --- Kitchen: marble-topped island, brass stools, back counter ---
      S(4.6, 8.4, f0, f0 + 0.86, 4.5, 5.9, M.stoneDark, 1.5);
      S(4.5, 8.5, f0 + 0.86, f0 + 0.93, 4.4, 6.0, M.coping);
      for (const px of [5.6, 7.4]) {
        S(px - 0.17, px + 0.17, 2.95, 3.07, 5.03, 5.37, M.warmLight, 1, false);
        S(px - 0.01, px + 0.01, 3.07, ceil, 5.19, 5.21, M.frame, 1, false);
      }
      for (const x of [5.3, 6.5, 7.7]) {
        S(x - 0.2, x + 0.2, f0 + 0.66, f0 + 0.72, 3.75, 4.15, M.fabricDark);
        S(x - 0.025, x + 0.025, f0, f0 + 0.66, 3.925, 3.975, M.gold);
        S(x - 0.18, x + 0.18, f0, f0 + 0.02, 3.77, 4.13, M.gold, 1, false);
      }
      S(4.4, 9.75, f0, f0 + 0.88, 9.05, 9.74, M.stoneDark, 1.5);
      S(4.4, 9.75, f0 + 0.88, f0 + 0.94, 9.0, 9.74, M.coping);

      // --- Fireplace wall (west) with live flames + art above ---
      S(-13.74, -13.2, g0, ceil, -1.6, 3.6, M.stoneDark, 1.5);
      S(-13.21, -13.19, f0 + 0.35, f0 + 1.05, -0.5, 2.5, M.soot, 1, false);
      S(-13.2, -12.75, f0, f0 + 0.32, -1.6, 3.6, M.stoneDark, 1.5);
      const fpFlame = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.62).translate(0, 0.31, 0), this.flameMaterial(this.tex.flameWide));
      fpFlame.rotation.y = Math.PI / 2;
      fpFlame.position.set(-13.17, f0 + 0.38, 1.0);
      villa.add(fpFlame);
      this.flames.push({ mesh: fpFlame, phase: 0.3 });
      const fpLight = new THREE.PointLight(0xff8a3c, 1.6, 9, 2);
      fpLight.position.set(-12.5, f0 + 0.9, 1.0);
      villa.add(fpLight);
      this.flickers.push({ light: fpLight, base: 1.6, phase: 1.1 });
      this.artPanel(villa, M.artA, 2.2, 1.3, -13.17, 2.75, 1.0, Math.PI / 2);
      this.artPanel(villa, M.artB, 2.6, 1.5, -2.1, 2.3, 9.71, Math.PI);

      // --- Foyer chandelier (double brass halo) ---
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 10, 48), M.gold);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(2.1, 3.3, 7.3);
      villa.add(halo);
      const haloGlow = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 8, 48), M.warmLight);
      haloGlow.rotation.x = Math.PI / 2;
      haloGlow.position.set(2.1, 3.27, 7.3);
      villa.add(haloGlow);
      const halo2 = halo.clone();
      halo2.scale.setScalar(0.62);
      halo2.position.y = 3.05;
      villa.add(halo2);
      const halo2Glow = haloGlow.clone();
      halo2Glow.scale.setScalar(0.62);
      halo2Glow.position.y = 3.03;
      villa.add(halo2Glow);
      for (const a of [0, 2.094, 4.189]) {
        const wx = 2.1 + Math.cos(a) * 0.62, wz = 7.3 + Math.sin(a) * 0.62;
        S(wx - 0.006, wx + 0.006, 3.3, ceil, wz - 0.006, wz + 0.006, M.frame, 1, false);
      }
      const chLight = new THREE.PointLight(0xffd3a0, 1.3, 11, 2);
      chLight.position.set(2.1, 2.95, 7.3);
      villa.add(chLight);

      // --- Indoor plants ---
      this.plant(villa, 4.05, f0, -5.45, 1.7);
      this.plant(villa, -13.15, f0, 9.2, 1.9);
      this.plant(villa, 0.3, f0, 9.25, 1.5);
      this.plant(villa, 3.9, f0, 9.25, 1.5);
      this.plant(villa, -13.1, f0, -5.2, 1.7);

      this.buildWhiteboard(villa);

      // "The Ledger" home bar + Marcus, the AI bartender (bar3d.js)
      if (window.CribBar) {
        try {
          this.bar = new window.CribBar(this, villa, f0);
        } catch (e) {
          console.warn('Bar failed to build:', e);
        }
      }
    }

    // ============================================================
    // OVERVIEW WHITEBOARD on the west wall (between fireplace + plant)
    // ============================================================
    buildWhiteboard(villa) {
      const x = -13.74, z0 = 4.4, z1 = 8.6, y0 = 1.1, y1 = 3.1;
      const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.35 });
      this.slab(x, x + 0.05, y0 - 0.05, y1 + 0.05, z0 - 0.05, z1 + 0.05, alu, 1, villa, false);
      const tex = this.makeWhiteboardTexture();
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(z1 - z0, y1 - y0),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.1 })
      );
      board.rotation.y = Math.PI / 2; // faces +x, into the room
      board.position.set(x + 0.052, (y0 + y1) / 2, (z0 + z1) / 2);
      villa.add(board);
      // marker tray, markers, eraser
      this.slab(x, x + 0.16, y0 - 0.1, y0 - 0.06, z0 + 0.4, z1 - 0.4, alu, 1, villa);
      [0x1d4ed8, 0xdc2626, 0x15803d, 0x111827].forEach((c, i) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
        m.rotation.x = Math.PI / 2;
        m.position.set(x + 0.1, y0 - 0.04, z0 + 0.8 + i * 0.22);
        villa.add(m);
      });
      this.slab(x + 0.04, x + 0.14, y0 - 0.06, y0 - 0.01, z1 - 1.3, z1 - 1.0, this.mat.fabricDark, 1, villa);
    }

    makeWhiteboardTexture() {
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 488;
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 8;
      const draw = () => {
        const g = c.getContext('2d');
        const rng = makeRng(42);
        const bg = g.createLinearGradient(0, 0, 1024, 488);
        bg.addColorStop(0, '#ffffff');
        bg.addColorStop(1, '#e8ecef');
        g.fillStyle = bg;
        g.fillRect(0, 0, 1024, 488);
        for (let i = 0; i < 14; i++) { // faint eraser smudges
          const sx = rng() * 1024, sy = rng() * 488, r = 40 + rng() * 110;
          const gr = g.createRadialGradient(sx, sy, 0, sx, sy, r);
          gr.addColorStop(0, 'rgba(120,130,140,0.07)');
          gr.addColorStop(1, 'rgba(120,130,140,0)');
          g.fillStyle = gr;
          g.fillRect(sx - r, sy - r, r * 2, r * 2);
        }
        const marker = '"Permanent Marker", "Comic Sans MS", cursive';
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.fillStyle = '#1d4ed8';
        g.font = `60px ${marker}`;
        g.fillText('FLORIDA FUND', 48, 92);
        g.strokeStyle = '#1d4ed8';
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(48, 112);
        g.quadraticCurveTo(250, 126, 470, 106);
        g.stroke();
        g.fillStyle = '#dc2626';
        g.font = `56px ${marker}`;
        g.fillText('GOAL', 800, 92);
        g.strokeStyle = '#dc2626';
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(866, 72, 112, 52, -0.06, 0, Math.PI * 2);
        g.stroke();
        ['#1d4ed8', '#dc2626', '#ea580c', '#15803d', '#b45309', '#111827'].forEach((ink, i) => {
          const y = 170 + i * 48;
          g.strokeStyle = ink;
          g.lineWidth = 4;
          g.strokeRect(60, y, 420, 24);
          g.globalAlpha = 0.35;
          g.fillStyle = ink;
          g.fillRect(64, y + 4, 60 + rng() * 300, 16);
          g.globalAlpha = 1;
          g.beginPath();
          g.arc(530, y + 12, 16, 0, Math.PI * 2);
          g.stroke();
        });
        // palm tree + sun doodle (Florida!)
        g.strokeStyle = '#92400e';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(830, 450);
        g.quadraticCurveTo(810, 360, 850, 270);
        g.stroke();
        g.strokeStyle = '#15803d';
        g.lineWidth = 6;
        for (const [dx, dy] of [[-80, 20], [-60, -30], [0, -50], [60, -28], [85, 25]]) {
          g.beginPath();
          g.moveTo(850, 270);
          g.quadraticCurveTo(850 + dx * 0.5, 270 + dy - 25, 850 + dx, 270 + dy + 25);
          g.stroke();
        }
        g.strokeStyle = '#f59e0b';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(960, 220, 30, 0, Math.PI * 2);
        g.stroke();
        tex.needsUpdate = true;
      };
      draw();
      if (document.fonts && document.fonts.load) document.fonts.load('60px "Permanent Marker"').then(draw).catch(() => {});
      return tex;
    }

    // ============================================================
    // EXTERIOR DETAILS: reflecting pool, bollards, umbrella, fire pit
    // ============================================================
    buildExteriorDetails(T) {
      const M = this.mat;

      // --- Reflecting pool along the entrance facade, with floating light orbs ---
      const rx0 = -12.6, rx1 = -3.4, rz0 = 10.7, rz1 = 12.7, rim = 0.18;
      this.slab(rx0, rx1, T, T + 0.02, rz0, rz1, M.soot, 1);
      this.slab(rx0, rx1, T, T + 0.14, rz0, rz0 + rim, M.coping, 1);
      this.slab(rx0, rx1, T, T + 0.14, rz1 - rim, rz1, M.coping, 1);
      this.slab(rx0, rx0 + rim, T, T + 0.14, rz0 + rim, rz1 - rim, M.coping, 1);
      this.slab(rx1 - rim, rx1, T, T + 0.14, rz0 + rim, rz1 - rim, M.coping, 1);
      const rp = new THREE.Mesh(new THREE.PlaneGeometry(rx1 - rx0 - rim * 2, rz1 - rz0 - rim * 2), M.waterDark);
      rp.rotation.x = -Math.PI / 2;
      rp.position.set((rx0 + rx1) / 2, T + 0.1, (rz0 + rz1) / 2);
      rp.receiveShadow = true;
      this.scene.add(rp);
      [-10.8, -8.0, -5.2].forEach((x, i) => {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), M.orb);
        orb.position.set(x, T + 0.2, (rz0 + rz1) / 2);
        this.scene.add(orb);
        this.bobbers.push({ mesh: orb, y: T + 0.2, phase: i * 2.1 });
      });

      // --- Driveway bollard lights ---
      for (const z of [25, 31, 37, 43]) {
        for (const x of [-2.85, 8.85]) {
          this.slab(x - 0.08, x + 0.08, 0, 0.62, z - 0.08, z + 0.08, M.frame, 1);
          this.slab(x - 0.085, x + 0.085, 0.62, 0.7, z - 0.085, z + 0.085, M.warmLight, 1, this.scene, false);
          this.slab(x - 0.09, x + 0.09, 0.7, 0.74, z - 0.09, z + 0.09, M.frame, 1);
        }
      }

      // --- Pool-side umbrella ---
      const ux = 25.9, uz = -6.6;
      this.slab(ux - 0.25, ux + 0.25, T, T + 0.08, uz - 0.25, uz + 0.25, M.stoneDark, 1);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), M.frame);
      pole.position.set(ux, T + 1.25, uz);
      pole.castShadow = true;
      this.scene.add(pole);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.45, 10, 1, true), M.canopy);
      shade.position.set(ux, T + 2.45, uz);
      shade.castShadow = true;
      this.scene.add(shade);

      // --- Ocean-side fire pit lounge (visible from inside the house) ---
      const fx = -4, fz = -11;
      const pit = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.42, 36), M.stoneDark);
      pit.position.set(fx, T + 0.21, fz);
      pit.castShadow = true;
      pit.receiveShadow = true;
      this.scene.add(pit);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.02, 36), M.soot);
      bowl.position.set(fx, T + 0.43, fz);
      this.scene.add(bowl);
      const ember = new THREE.Mesh(
        new THREE.CircleGeometry(0.78, 36),
        new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
      );
      ember.rotation.x = -Math.PI / 2;
      ember.position.set(fx, T + 0.445, fz);
      this.scene.add(ember);
      const fMat = this.flameMaterial(this.tex.flameTall);
      [0, Math.PI / 2, Math.PI / 4].forEach((ry, i) => {
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.95).translate(0, 0.475, 0), fMat);
        fl.position.set(fx, T + 0.44, fz);
        fl.rotation.y = ry;
        this.scene.add(fl);
        this.flames.push({ mesh: fl, phase: 1.7 + i * 2.3 });
      });
      const pitLight = new THREE.PointLight(0xff8840, 2.2, 11, 2);
      pitLight.position.set(fx, T + 1.1, fz);
      this.scene.add(pitLight);
      this.flickers.push({ light: pitLight, base: 2.2, phase: 2.7 });
      // three lounge benches, open toward the house
      for (const a of [Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const g = new THREE.Group();
        g.position.set(fx + Math.sin(a) * 2.6, T, fz + Math.cos(a) * 2.6);
        g.rotation.y = a;
        this.slab(-1.2, 1.2, 0, 0.06, -0.44, 0.48, M.frame, 1, g);
        this.slab(-1.2, 1.2, 0.06, 0.38, -0.42, 0.42, M.fabric, 1, g);
        this.slab(-1.2, 1.2, 0.38, 0.82, 0.3, 0.46, M.fabric, 1, g);
        this.scene.add(g);
      }
    }

    // floor-to-ceiling glazing with bronze mullions
    glassWall(parent, axis, at, from, to, y0, y1, spacing) {
      const M = this.mat;
      const lo = Math.min(from, to), hi = Math.max(from, to);
      const t = 0.05;
      if (axis === 'x') {
        this.slab(at - 0.02, at + 0.02, y0, y1, lo, hi, M.glass, 2, parent, false);
        for (let z = lo; z <= hi + 0.01; z += spacing) this.slab(at - t, at + t, y0, y1, z - t, z + t, M.frame, 1, parent);
        this.slab(at - t, at + t, y0, y0 + 0.08, lo, hi, M.frame, 1, parent);
        this.slab(at - t, at + t, y1 - 0.08, y1, lo, hi, M.frame, 1, parent);
      } else {
        this.slab(lo, hi, y0, y1, at - 0.02, at + 0.02, M.glass, 2, parent, false);
        for (let x = lo; x <= hi + 0.01; x += spacing) this.slab(x - t, x + t, y0, y1, at - t, at + t, M.frame, 1, parent);
        this.slab(lo, hi, y0, y0 + 0.08, at - t, at + t, M.frame, 1, parent);
        this.slab(lo, hi, y1 - 0.08, y1, at - t, at + t, M.frame, 1, parent);
      }
    }

    // window set into a solid wall (dir = 1 faces +z / outside, dir = -1 faces -z / inside)
    windowPanel(parent, x0, x1, y0, y1, z, dir = 1) {
      const M = this.mat;
      const span = (d) => (dir > 0 ? [z, z + d] : [z - d, z]);
      const [g0, g1] = span(0.04), [f0, f1] = span(0.1), [m0, m1] = span(0.08);
      this.slab(x0, x1, y0, y1, g0, g1, M.windowDark, 1, parent, false);
      const f = 0.06;
      this.slab(x0 - f, x1 + f, y0 - f, y0, f0, f1, M.frame, 1, parent);
      this.slab(x0 - f, x1 + f, y1, y1 + f, f0, f1, M.frame, 1, parent);
      this.slab(x0 - f, x0, y0, y1, f0, f1, M.frame, 1, parent);
      this.slab(x1, x1 + f, y0, y1, f0, f1, M.frame, 1, parent);
      for (let x = x0 + 2.2; x < x1 - 0.5; x += 2.2) this.slab(x - 0.03, x + 0.03, y0, y1, m0, m1, M.frame, 1, parent);
    }

    buildLoungers(T) {
      const M = this.mat;
      for (const x of [24.3, 25.9, 27.5]) {
        const g = new THREE.Group();
        this.slab(-0.38, 0.38, 0.1, 0.32, -1.0, 1.0, M.deck, 1, g);
        this.slab(-0.35, 0.35, 0.32, 0.42, -1.0, 0.45, M.fabric, 1, g);
        const back = this.slab(-0.35, 0.35, -0.05, 0.05, 0, 0.75, M.fabric, 1, g);
        back.position.set(0, 0.62, 0.68);
        back.rotation.x = -0.75;
        for (const lz of [-0.9, 0.9]) for (const lx of [-0.32, 0.32]) this.slab(lx - 0.03, lx + 0.03, 0, 0.12, lz - 0.03, lz + 0.03, M.frame, 1, g);
        g.position.set(x, T, -4);
        this.scene.add(g);
      }
    }

    // ============================================================
    // PALMS — one species (coconut palm), consistent everywhere
    // ============================================================
    makeFrondTexture() {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 1024;
      const g = c.getContext('2d');
      const cx = 128;
      // leaflets: base of frond = bottom of canvas, tip = top
      for (let y = 930; y > 24; y -= 6.5) {
        const t = (1024 - y) / 1024;
        for (const s of [-1, 1]) {
          const len = (96 + rand() * 24) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
          const ang = THREE.MathUtils.degToRad(58 + rand() * 10);
          const dx = s * Math.sin(ang), dy = -Math.cos(ang);
          const bx = cx + s * 3, by = y;
          const ex = bx + dx * len, ey = by + dy * len + len * 0.12; // slight droop
          const mx = (bx + ex) / 2, my = (by + ey) / 2;
          const nx = -dy, ny = dx, wd = 2.6 + rand() * 1.0;
          const hue = 88 + rand() * 22 - t * 10;
          const light = 20 + rand() * 12 + (t > 0.85 ? 8 : 0);
          g.fillStyle = `hsl(${hue}, ${42 + rand() * 18}%, ${light}%)`;
          g.beginPath();
          g.moveTo(bx, by);
          g.quadraticCurveTo(mx + nx * wd, my + ny * wd, ex, ey);
          g.quadraticCurveTo(mx - nx * wd, my - ny * wd, bx, by);
          g.fill();
          if (rand() < 0.12) { // dry tips like real fronds
            g.strokeStyle = `hsl(38, 40%, ${30 + rand() * 15}%)`;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(mx + (ex - mx) * 0.6, my + (ey - my) * 0.6);
            g.lineTo(ex, ey);
            g.stroke();
          }
        }
      }
      // rachis (central stem)
      const grad = g.createLinearGradient(0, 1024, 0, 0);
      grad.addColorStop(0, '#7d6a3e');
      grad.addColorStop(1, '#a3a55a');
      g.strokeStyle = grad;
      for (let y = 1024; y > 0; y -= 16) {
        g.lineWidth = 2 + 8 * (y / 1024);
        g.beginPath();
        g.moveTo(cx, y);
        g.lineTo(cx, y - 17);
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 8;
      return tex;
    }

    makeFrondGeometry(L, W, arcUp, droop, fold) {
      const seg = 16;
      const p = [], uv = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const px = L * t * (1 - 0.12 * t);
        const py = L * (arcUp * t - droop * t * t);
        let tx = L * (1 - 0.24 * t), ty = L * (arcUp - 2 * droop * t);
        const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
        const nx = -ty, ny = tx; // up-ish normal of the spine
        const w = t < 0.1 ? W * 0.04 : W * Math.pow(Math.sin(Math.PI * Math.min(1, (t - 0.06) / 0.94)), 0.65) * (1 - 0.2 * t);
        const ex = px - nx * fold * w, ey = py - ny * fold * w;
        p.push(ex, ey, w, px, py, 0, ex, ey, -w);
        uv.push(0, t, 0.5, t, 1, t);
      }
      for (let i = 0; i < seg; i++) {
        const a = i * 3, b = (i + 1) * 3;
        idx.push(a, a + 1, b + 1, a, b + 1, b, a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }

    buildPalms() {
      const leafTex = this.tex.leaf;
      const leafBase = {
        map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65, metalness: 0,
        emissiveMap: leafTex
      };
      this.leafMats = {
        young: new THREE.MeshStandardMaterial(Object.assign({ color: 0xf2ffe0, emissive: 0x1a2a0a }, leafBase)),
        mature: new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, emissive: 0x101c06 }, leafBase)),
        old: new THREE.MeshStandardMaterial(Object.assign({ color: 0xdcc98a, emissive: 0x161205 }, leafBase)),
        dead: new THREE.MeshStandardMaterial(Object.assign({ color: 0x9a7448, emissive: 0x000000, roughness: 0.9 }, leafBase))
      };
      this.leafDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5 });

      this.frondGeos = {
        young: this.makeFrondGeometry(3.4, 0.95, 0.75, 0.55, 0.32),
        mid: this.makeFrondGeometry(4.6, 1.15, 0.5, 0.75, 0.38),
        mature: this.makeFrondGeometry(5.1, 1.2, 0.3, 0.85, 0.42),
        old: this.makeFrondGeometry(4.7, 1.05, 0.05, 0.7, 0.45)
      };

      this.barkMat = new THREE.MeshStandardMaterial({
        map: this.tex.bark.diff, normalMap: this.tex.bark.nor, roughnessMap: this.tex.bark.rough,
        color: 0xc8bba8, roughness: 1, metalness: 0
      });
      this.bootMat = new THREE.MeshStandardMaterial({ map: this.tex.bark.diff, color: 0x6e5a3e, roughness: 1 });
      this.nutMat = new THREE.MeshStandardMaterial({ color: 0x5b5420, roughness: 0.55 });

      // [x, z, height, lean toward ocean (m)]
      const spots = [
        [-46, shoreZ(-46) + 30, 12.5, 2.2], [-31, shoreZ(-31) + 31, 10.5, 1.6], [-14, shoreZ(-14) + 30, 13, 2.4],
        [36, shoreZ(36) + 30, 11.5, 2.0], [50, shoreZ(50) + 31, 13.5, 2.6],
        [31.5, -6, 11, 1.2], [33.2, -2.8, 8.4, 0.9],
        [-22, 4, 12, 1.4], [-24, -9, 9.5, 1.1],
        [-5.2, 24, 9.2, 0.6], [11.4, 25.5, 10.6, 0.8]
      ];
      for (const [x, z, h, lean] of spots) this.createPalm(x, z, h, lean);
    }

    createPalm(x, z, height, leanAmt) {
      const root = new THREE.Group();
      root.position.set(x, groundHeight(x, z) - 0.05, z);
      this.scene.add(root);

      // palms lean toward the sea and the light, with natural variation
      const la = Math.PI * 1.0 + (rand() - 0.5) * 1.4; // mostly -z
      const lx = Math.sin(la), lz = Math.cos(la);
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const bend = leanAmt * Math.pow(t, 1.7);
        const wob = Math.sin(t * 5 + x) * 0.12 * t;
        pts.push(new THREE.Vector3(lx * bend + wob, height * t, lz * bend));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tub = 48, rad = 12;
      const geo = new THREE.TubeGeometry(curve, tub, 1, rad, false);
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      const c = new THREE.Vector3(), v = new THREE.Vector3();
      for (let i = 0; i <= tub; i++) {
        const t = i / tub;
        curve.getPointAt(t, c);
        const r = 0.24 * (1 - 0.28 * t) + 0.2 * Math.exp(-t * 22);
        for (let j = 0; j <= rad; j++) {
          const k = i * (rad + 1) + j;
          v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
          pos.setXYZ(k, v.x, v.y, v.z);
          uv.setXY(k, (j / rad) * 2, t * height / 1.3); // rings run around the trunk
        }
      }
      geo.computeVertexNormals();
      const trunk = new THREE.Mesh(geo, this.barkMat);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      root.add(trunk);

      // crown sits on the trunk tip, tilted along the trunk direction
      const top = curve.getPointAt(1);
      const tan = curve.getTangentAt(1);
      const crown = new THREE.Group();
      crown.position.copy(top);
      crown.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize());
      root.add(crown);

      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.9, 10), this.bootMat);
      boot.position.y = 0.2;
      boot.castShadow = true;
      crown.add(boot);

      // coconuts tucked under the leaf bases
      const nutCount = 4 + Math.floor(rand() * 5);
      for (let i = 0; i < nutCount; i++) {
        const a = rand() * Math.PI * 2;
        const nut = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), this.nutMat);
        nut.scale.set(1, 1.15, 1);
        nut.position.set(Math.cos(a) * 0.3, -0.05 - rand() * 0.25, Math.sin(a) * 0.3);
        nut.castShadow = true;
        crown.add(nut);
      }

      // fronds: golden-angle spiral, young ones up top, old ones drooping below
      const fronds = [];
      const N = 22;
      const sc = 0.85 + rand() * 0.25;
      for (let k = 0; k < N; k++) {
        const a = k / (N - 1);
        let geoKey, mat, pitch;
        if (a < 0.18) { geoKey = 'young'; mat = this.leafMats.young; pitch = 0.55 - a; }
        else if (a < 0.55) { geoKey = 'mid'; mat = this.leafMats.mature; pitch = 0.3 - a * 0.6; }
        else if (a < 0.88) { geoKey = 'mature'; mat = this.leafMats.mature; pitch = 0.05 - a * 0.55; }
        else { geoKey = 'old'; mat = this.leafMats.old; pitch = -0.55 - (a - 0.88) * 2; }
        pitch += (rand() - 0.5) * 0.15;

        const holder = new THREE.Group();
        holder.rotation.y = k * 2.39996 + rand() * 0.25;
        holder.position.y = 0.55 - a * 0.35;
        const frond = new THREE.Mesh(this.frondGeos[geoKey], mat);
        frond.rotation.z = pitch;
        frond.scale.setScalar(sc * (0.9 + rand() * 0.2));
        frond.castShadow = true;
        frond.customDepthMaterial = this.leafDepth;
        holder.add(frond);
        crown.add(holder);
        fronds.push({ mesh: frond, pitch, phase: rand() * 6.28, amp: 0.025 + a * 0.03 });
      }
      // one or two dead fronds hanging against the trunk
      for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) {
        const holder = new THREE.Group();
        holder.rotation.y = rand() * Math.PI * 2;
        holder.position.y = 0.1;
        const frond = new THREE.Mesh(this.frondGeos.old, this.leafMats.dead);
        frond.rotation.z = -1.25 - rand() * 0.2;
        frond.scale.setScalar(sc * 0.85);
        frond.castShadow = true;
        frond.customDepthMaterial = this.leafDepth;
        holder.add(frond);
        crown.add(holder);
      }

      this.palms.push({ root, crown, fronds, phase: rand() * 6.28, height });
    }

    // ============================================================
    // GRASS — short manicured lawn + dry dune grass (GPU wind)
    // ============================================================
    buildGrass() {
      // single tapered, slightly curved blade (unit height)
      const levels = [0, 0.38, 0.72], widths = [0.5, 0.36, 0.18];
      const p = [];
      levels.forEach((y, i) => { const z = 0.22 * y * y; p.push(-widths[i], y, z, widths[i], y, z); });
      p.push(0, 1, 0.22);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(21).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      geo.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 6]);

      const lawnTarget = 150000, duneTarget = 26000;
      const total = lawnTarget + duneTarget;
      const tints = new Float32Array(total * 3);
      const mesh = new THREE.InstancedMesh(geo, null, total);
      const dummy = new THREE.Object3D();
      const camX = this.baseCamPos.x, camZ = this.baseCamPos.z;
      const inPlinth = (x, z) => x > -18.6 && x < 29.6 && z > -16.6 && z < 19.4;
      const inDrive = (x, z) => x > -2.9 && x < 8.9 && z > 18 && z < 50;
      const nearPalm = (x, z) => this.palms.some((pm) => Math.hypot(pm.root.position.x - x, pm.root.position.z - z) < 0.7);

      let n = 0, guard = 0;
      // Lawn — denser close to the camera, where you can actually see blades
      while (n < lawnTarget && guard++ < lawnTarget * 8) {
        const x = -85 + rand() * 175, z = -40 + rand() * 120;
        if (z - shoreZ(x) < 33.5 || inPlinth(x, z) || inDrive(x, z)) continue;
        const dist = Math.hypot(x - camX, z - camZ);
        if (rand() > Math.min(1, Math.max(0.12, 1.5 - dist / 45))) continue;
        if (nearPalm(x, z)) continue;
        const h = 0.13 + rand() * 0.12;
        dummy.position.set(x, groundHeight(x, z), z);
        dummy.rotation.set((rand() - 0.5) * 0.3, rand() * Math.PI * 2, (rand() - 0.5) * 0.3, 'YXZ');
        dummy.scale.set(0.035 + rand() * 0.02, h, h);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        const k = 0.8 + rand() * 0.35;
        tints[n * 3] = 0.34 * k + rand() * 0.04;
        tints[n * 3 + 1] = 0.56 * k;
        tints[n * 3 + 2] = 0.17 * k;
        n++;
      }
      // Dune grass in clumps along the top of the beach
      guard = 0;
      while (n < total && guard++ < 20000) {
        const cx = -120 + rand() * 230;
        const d = 19 + rand() * 12;
        const cz = shoreZ(cx) + d;
        if (inPlinth(cx, cz)) continue;
        const blades = 10 + Math.floor(rand() * 22);
        for (let b = 0; b < blades && n < total; b++) {
          const a = rand() * Math.PI * 2, r = rand() * 0.45;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          const h = 0.45 + rand() * 0.6;
          dummy.position.set(x, groundHeight(x, z), z);
          dummy.rotation.set(0.25 + rand() * 0.35, a + Math.PI / 2 + (rand() - 0.5) * 0.6, 0, 'YXZ');
          dummy.scale.set(0.03 + rand() * 0.015, h, h);
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          const dry = rand();
          tints[n * 3] = 0.42 + dry * 0.28;
          tints[n * 3 + 1] = 0.48 + dry * 0.12;
          tints[n * 3 + 2] = 0.22 + dry * 0.1;
          n++;
        }
      }
      mesh.count = n;
      geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));

      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
      const uniforms = this.grassUniforms;
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec3 aTint;\nvarying vec3 vTint;\nvarying float vH;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;\nvH = position.y;')
          .replace('#include <project_vertex>', `
            vec4 mvPosition = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
              mvPosition = instanceMatrix * mvPosition;
              vec3 ip = instanceMatrix[3].xyz;
              float bh = length(instanceMatrix[1].xyz);
            #else
              vec3 ip = vec3(0.0);
              float bh = 1.0;
            #endif
            float gust = sin(uTime * 1.2 + ip.x * 0.19 + ip.z * 0.13) * 0.6 + sin(uTime * 2.7 + ip.x * 0.8 - ip.z * 0.5) * 0.25;
            float bend = position.y * position.y * bh;
            mvPosition.x += (0.25 + gust) * bend * 0.22;
            mvPosition.z += (0.15 + gust) * bend * 0.12;
            mvPosition = modelViewMatrix * mvPosition;
            gl_Position = projectionMatrix * mvPosition;
          `);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vTint;\nvarying float vH;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vTint * 0.3, vTint * 1.05, smoothstep(0.0, 1.0, vH));');
      };
      mesh.material = mat;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.grass = mesh;
      this.scene.add(mesh);
    }

    // ============================================================
    // CAR — real Ferrari model (three.js example asset, Draco)
    // ============================================================
    loadCar() {
      if (!THREE.GLTFLoader || !THREE.DRACOLoader) return;
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('assets/draco/');
      const loader = new THREE.GLTFLoader();
      loader.setDRACOLoader(draco);
      loader.load('assets/models/ferrari.glb', (gltf) => {
        const car = gltf.scene.children[0];
        const paint = new THREE.MeshPhysicalMaterial({
          color: 0x8d949c, metalness: 0.9, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03
        });
        const detail = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.25 });
        const glass = new THREE.MeshPhysicalMaterial({ color: 0x111418, metalness: 0.25, roughness: 0, transparent: true, opacity: 0.85 });
        const setMat = (name, m) => { const o = car.getObjectByName(name); if (o) o.material = m; };
        setMat('body', paint);
        ['rim_fl', 'rim_fr', 'rim_rr', 'rim_rl', 'trim'].forEach((n) => setMat(n, detail));
        setMat('glass', glass);
        car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

        const aoTex = new THREE.TextureLoader().load('assets/models/ferrari_ao.png');
        const ao = new THREE.Mesh(
          new THREE.PlaneGeometry(0.655 * 4, 1.3 * 4),
          new THREE.MeshBasicMaterial({ map: aoTex, blending: THREE.MultiplyBlending, toneMapped: false, transparent: true })
        );
        ao.rotation.x = -Math.PI / 2;
        ao.renderOrder = 2;
        car.add(ao);

        // parked on the motor court, nose out, beside the entrance
        car.position.set(7.2, 0.45, 14.2);
        car.rotation.y = 0.95;
        this.scene.add(car);
      }, undefined, (err) => console.warn('Car model failed to load:', err));
    }

    // ============================================================
    // ENTRANCE CINEMATIC — fly to the door, open it, walk inside
    // ============================================================
    applyDoors() {
      for (const d of this.doorPivots) d.pivot.rotation.y = d.dir * this.doorAngle;
    }

    tweenDoors(to, dur, instant) {
      if (instant) {
        this.doorTween = null;
        this.doorAngle = to;
        this.applyDoors();
        return;
      }
      this.doorTween = { from: this.doorAngle, to, t0: this.now, dur };
    }

    tweenShift(to, dur, instant) {
      if (instant) {
        this.shiftTween = null;
        this.viewShiftFactor = to;
        this.applyViewOffset();
        return;
      }
      this.shiftTween = { from: this.viewShiftFactor, to, t0: this.now, dur };
    }

    makePath(points) {
      return points.length > 2
        ? new THREE.CatmullRomCurve3(points, false, 'centripetal')
        : new THREE.LineCurve3(points[0], points[1]);
    }

    // segments: [{ dur, ease, pos: [V3...], look: [V3...] }], events: [{ at, name, fn(instant) }]
    runCinematic(segments, events, onEvent, endMode) {
      return new Promise((resolve) => {
        let acc = 0;
        const segs = segments.map((s) => {
          const seg = { dur: s.dur, ease: EASE[s.ease] || EASE.inOutCubic, start: acc, pos: this.makePath(s.pos), look: this.makePath(s.look) };
          acc += s.dur;
          return seg;
        });
        this.cine = {
          t0: this.now, segs, total: acc, skipped: false, endMode, resolve, onEvent,
          events: events.map((e) => Object.assign({ fired: false }, e))
        };
      });
    }

    updateCinematic(t) {
      const c = this.cine;
      const el = t - c.t0;
      for (const e of c.events) {
        if (!e.fired && el >= e.at) {
          e.fired = true;
          if (e.fn) e.fn(c.skipped);
          if (!c.skipped && c.onEvent) c.onEvent(e.name);
        }
      }
      let seg = c.segs[c.segs.length - 1];
      for (const s of c.segs) {
        if (el < s.start + s.dur) { seg = s; break; }
      }
      const u = Math.min(1, Math.max(0, (el - seg.start) / seg.dur));
      const k = seg.ease(u);
      seg.pos.getPointAt(k, this.camera.position);
      seg.look.getPointAt(k, this._look);
      this.camera.lookAt(this._look);

      if (el >= c.total) {
        this.cine = null;
        this.mode = c.endMode;
        if (c.endMode === 'menu') {
          this.menuBlend = { t0: t, dur: 1.6, from: this.camera.position.clone(), lookFrom: this._look.clone() };
        }
        c.resolve();
      }
    }

    updateTweens(t) {
      if (this.doorTween) {
        const d = this.doorTween;
        const u = Math.min(1, (t - d.t0) / d.dur);
        this.doorAngle = d.from + (d.to - d.from) * EASE.inOutCubic(u);
        if (u >= 1) this.doorTween = null;
        this.applyDoors();
      }
      if (this.shiftTween) {
        const s = this.shiftTween;
        const u = Math.min(1, (t - s.t0) / s.dur);
        this.viewShiftFactor = s.from + (s.to - s.from) * EASE.inOutSine(u);
        if (u >= 1) this.shiftTween = null;
        this.applyViewOffset();
      }
    }

    playEntrance(onEvent) {
      if (this.cine || this.mode !== 'menu') return Promise.resolve();
      this.mode = 'cine';
      this.menuBlend = null;
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const inside = this.insidePose;
      const segments = [
        // sweep from the hero shot down the driveway to the front door
        { dur: 3.6, ease: 'inOutCubic',
          pos: [this.camera.position.clone(), V(30, 7.5, 37), V(13, 4.2, 30), V(2.1, 1.95, 21.5)],
          look: [this._look.clone(), V(5, 2.6, 6), V(2.1, 2.0, 10)] },
        // slow push toward the doors while they swing open
        { dur: 1.6, ease: 'inOutSine',
          pos: [V(2.1, 1.95, 21.5), V(2.1, 1.75, 15.2)],
          look: [V(2.1, 2.0, 10), V(2.1, 1.9, 9)] },
        // walk through the doorway into the foyer, turning toward the ocean view
        { dur: 2.7, ease: 'inOutCubic',
          pos: [V(2.1, 1.75, 15.2), V(2.1, 1.72, 11.4), V(2.0, 1.68, 8.2), inside.pos.clone()],
          look: [V(2.1, 1.9, 9), V(1.8, 1.75, 0), inside.look.clone()] }
      ];
      const events = [
        { at: 0, name: 'depart', fn: (i) => this.tweenShift(0, 2.8, i) },
        { at: 3.9, name: 'doors', fn: (i) => this.tweenDoors(this.doorOpenAngle, 1.9, i) },
        { at: 6.1, name: 'threshold' }
      ];
      return this.runCinematic(segments, events, onEvent, 'inside');
    }

    playExit(onEvent) {
      if (this.cine || this.mode !== 'inside') return Promise.resolve();
      this.mode = 'cine';
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const inside = this.insidePose;
      let startPos = this.camera.position.clone(), startLook = this._look.clone(), offset = 0;
      const pre = [];
      if (this.restPose === this.boardPose) {
        // walk back from the whiteboard to the foyer first
        pre.push({ dur: 1.8, ease: 'inOutCubic',
          pos: [startPos, V(-3.5, 1.9, 6.9), inside.pos.clone()],
          look: [startLook, V(-6, 1.8, -4), inside.look.clone()] });
        startPos = inside.pos.clone();
        startLook = inside.look.clone();
        offset = 1.8;
      } else if (this.restPose === this.barPose) {
        // get up from the bar and head back to the foyer first
        pre.push({ dur: 2.2, ease: 'inOutCubic',
          pos: [startPos, V(-2.6, 1.7, 1.2), V(-0.8, 1.75, 3.6), inside.pos.clone()],
          look: [startLook, V(-4.5, 1.6, -1), inside.look.clone()] });
        startPos = inside.pos.clone();
        startLook = inside.look.clone();
        offset = 2.2;
        if (this.bar) { this.bar.setEngaged(false); this.bar.setLights(0.45); }
      }
      this.restPose = inside;
      const segments = pre.concat([
        // step back out through the doorway, still facing in
        { dur: 2.4, ease: 'inOutCubic',
          pos: [startPos, V(2.0, 1.7, 8.6), V(2.1, 1.75, 12.5), V(2.1, 1.9, 17.5)],
          look: [startLook, V(1.5, 1.7, -2), V(2.1, 1.8, 4)] },
        // rise back up to the hero shot
        { dur: 3.4, ease: 'inOutCubic',
          pos: [V(2.1, 1.9, 17.5), V(13, 4.2, 30), V(30, 7.5, 37), this.baseCamPos.clone()],
          look: [V(2.1, 1.8, 4), V(5, 2.6, 6), this.camTarget.clone()] }
      ]);
      const events = [
        { at: offset + 1.5, name: 'doorsClose', fn: (i) => this.tweenDoors(0, 1.6, i) },
        { at: offset + 2.2, name: 'depart', fn: (i) => this.tweenShift(1, 3.0, i) }
      ];
      return this.runCinematic(segments, events, onEvent, 'menu');
    }

    // foyer -> whiteboard on the west wall
    goToBoard(onEvent) {
      if (this.cine || this.mode !== 'inside' || this.restPose === this.boardPose) return Promise.resolve();
      this.mode = 'cine';
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const b = this.boardPose;
      this.restPose = b;
      return this.runCinematic([{ dur: 2.6, ease: 'inOutCubic',
        pos: [this.camera.position.clone(), V(-3.5, 1.9, 6.9), b.pos.clone()],
        look: [this._look.clone(), V(-9, 1.9, 1.5), b.look.clone()] }], [], onEvent, 'inside');
    }

    // whiteboard -> foyer
    returnToFoyer(onEvent) {
      if (this.cine || this.mode !== 'inside' || this.restPose === this.insidePose) return Promise.resolve();
      this.mode = 'cine';
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const p = this.insidePose;
      this.restPose = p;
      return this.runCinematic([{ dur: 2.2, ease: 'inOutCubic',
        pos: [this.camera.position.clone(), V(-3.5, 1.9, 6.9), p.pos.clone()],
        look: [this._look.clone(), V(-6, 1.8, -4), p.look.clone()] }], [], onEvent, 'inside');
    }

    // foyer / whiteboard -> a slow cinematic pan across the room that settles on a stool at the bar
    goToBar(onEvent) {
      if (this.cine || this.mode !== 'inside' || this.restPose === this.barPose) return Promise.resolve();
      this.mode = 'cine';
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      this.updateBarPose();
      const bp = this.barPose;
      const fromBoard = this.restPose === this.boardPose;
      this.barReturnPose = this.restPose;
      this.restPose = bp;
      const segments = fromBoard
        ? [{ dur: 4.2, ease: 'inOutCubic',
          pos: [this.camera.position.clone(), V(-10.0, 1.95, 3.6), V(-9.2, 1.8, 0.4), V(-7.2, 1.95, 0.6), bp.pos.clone()],
          look: [this._look.clone(), V(-11.5, 1.8, -0.5), V(-7.8, 1.7, 3.2), V(-6.4, 1.85, 3.8), bp.look.clone()] }]
        : [{ dur: 4.4, ease: 'inOutCubic',
          pos: [this.camera.position.clone(), V(-0.6, 1.85, 3.9), V(-2.2, 1.75, 0.6), V(-4.0, 1.95, 0.5), bp.pos.clone()],
          look: [this._look.clone(), V(-3.2, 1.6, -2.5), V(-6.6, 1.7, 1.6), V(-6.5, 1.85, 3.8), bp.look.clone()] }];
      const events = [
        { at: 0.3, name: 'barLights', fn: () => { if (this.bar) { this.bar.setLights(1); this.bar.setEngaged(true); } } },
        { at: 2.9, name: 'barGreet', fn: (i) => { if (this.bar && !i) this.bar.greet(); } }
      ];
      return this.runCinematic(segments, events, onEvent, 'inside');
    }

    // bar -> wherever you came from
    leaveBar(onEvent) {
      if (this.cine || this.mode !== 'inside' || this.restPose !== this.barPose) return Promise.resolve();
      this.mode = 'cine';
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const back = this.barReturnPose || this.insidePose;
      this.restPose = back;
      const toBoard = back === this.boardPose;
      const segments = toBoard
        ? [{ dur: 3.2, ease: 'inOutCubic',
          pos: [this.camera.position.clone(), V(-7.2, 1.9, 0.6), V(-9.6, 1.85, 1.8), back.pos.clone()],
          look: [this._look.clone(), V(-9.5, 1.8, 2.6), V(-12.5, 1.9, 5.4), back.look.clone()] }]
        : [{ dur: 3.2, ease: 'inOutCubic',
          pos: [this.camera.position.clone(), V(-3.4, 1.8, 0.7), V(-0.8, 1.75, 3.6), back.pos.clone()],
          look: [this._look.clone(), V(-3.5, 1.7, -1.5), back.look.clone()] }];
      const events = [{ at: 0.2, name: 'barLeave', fn: () => { if (this.bar) { this.bar.setEngaged(false); this.bar.setLights(0.45); } } }];
      return this.runCinematic(segments, events, onEvent, 'inside');
    }

    skipCinematic() {
      if (!this.cine) return;
      this.cine.skipped = true;
      this.cine.t0 = this.now - this.cine.total - 0.001;
      // finish any tweens already in flight
      if (this.doorTween) this.tweenDoors(this.doorTween.to, 0, true);
      if (this.shiftTween) this.tweenShift(this.shiftTween.to, 0, true);
    }

    // ============================================================
    // LOOP
    // ============================================================
    animate() {
      const t = this.clock.getElapsedTime();
      const dt = t - this.lastT;
      this.lastT = t;
      this.now = t;

      // gentle camera drift + mouse parallax (like a slow drone hover)
      const mx = this.parallaxEnabled ? this.targetMouseX : 0;
      const my = this.parallaxEnabled ? this.targetMouseY : 0;
      this.mouseX += (mx - this.mouseX) * 0.03;
      this.mouseY += (my - this.mouseY) * 0.03;

      if (this.cine) {
        this.updateCinematic(t);
      } else if (this.mode === 'inside') {
        // standing inside: tiny handheld breathing + mouse look relative to the view direction
        const p = this.restPose;
        const sway = p.sway;
        this.camera.position.set(p.pos.x + Math.sin(t * 0.31) * 0.025 * sway, p.pos.y + Math.sin(t * 0.53) * 0.012, p.pos.z);
        const fx = p.look.x - p.pos.x, fz = p.look.z - p.pos.z, fl = Math.hypot(fx, fz) || 1;
        const rx = -fz / fl, rz = fx / fl;
        const mxs = this.mouseX * 2.2 * sway;
        this._tmpPos.set(p.look.x + rx * mxs, p.look.y - this.mouseY * 0.9 * sway, p.look.z + rz * mxs);
        this._look.lerp(this._tmpPos, 0.08);
        this.camera.lookAt(this._look);
      } else {
        this._tmpPos.set(
          this.baseCamPos.x + this.mouseX * 1.6 + Math.sin(t * 0.07) * 0.8,
          this.baseCamPos.y - this.mouseY * 0.7 + Math.sin(t * 0.11) * 0.15,
          this.baseCamPos.z - this.mouseX * 1.0
        );
        if (this.menuBlend) {
          // ease back into the live hover after the exit cinematic
          const b = this.menuBlend;
          const u = Math.min(1, (t - b.t0) / b.dur);
          const k = EASE.inOutSine(u);
          this.camera.position.lerpVectors(b.from, this._tmpPos, k);
          this._look.lerpVectors(b.lookFrom, this.camTarget, k);
          if (u >= 1) this.menuBlend = null;
        } else {
          this.camera.position.copy(this._tmpPos);
          this._look.copy(this.camTarget);
        }
        this.camera.lookAt(this._look);
      }
      this.updateTweens(t);

      // fire flicker (fireplace + fire pit) and floating orbs
      for (const f of this.flickers) {
        const n = Math.sin(t * 9.7 + f.phase) * 0.5 + Math.sin(t * 15.3 + f.phase * 2.1) * 0.3 + Math.sin(t * 23.1 + f.phase * 0.7) * 0.2;
        f.light.intensity = f.base * (0.85 + n * 0.15);
      }
      for (const f of this.flames) {
        const n = Math.sin(t * 8.3 + f.phase) * 0.5 + Math.sin(t * 13.7 + f.phase * 1.9) * 0.5;
        f.mesh.scale.y = 0.85 + n * 0.15;
        f.mesh.scale.x = 1 + Math.sin(t * 5.1 + f.phase) * 0.04;
      }
      for (const o of this.bobbers) o.mesh.position.y = o.y + Math.sin(t * 0.9 + o.phase) * 0.03;

      if (this.ocean) this.ocean.material.uniforms.time.value = t * 0.55;
      this.tex.poolNormals.offset.set((t * 0.02) % 1, (t * 0.013) % 1);
      this.grassUniforms.uTime.value = t;
      if (this.bar) this.bar.update(t, dt, this.camera);

      // palms: trunk sway + frond flutter in the sea breeze
      for (const p of this.palms) {
        const s = Math.sin(t * 0.6 + p.phase);
        p.root.rotation.z = s * 0.006;
        p.root.rotation.x = Math.cos(t * 0.45 + p.phase) * 0.004;
        p.crown.rotation.y = Math.sin(t * 0.35 + p.phase) * 0.03;
        for (const f of p.fronds) {
          f.mesh.rotation.z = f.pitch + Math.sin(t * 1.4 + f.phase) * f.amp;
          f.mesh.rotation.x = Math.sin(t * 2.1 + f.phase * 1.7) * f.amp * 1.4;
        }
      }

      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(this.animate);
    }
  }

  window.LuxuryMansion3D = LuxuryMansion3D;
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof THREE !== 'undefined') window.luxury3d = new LuxuryMansion3D('canvas-container-3d');
  });
})();
