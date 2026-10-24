# 🏰 Tha Crib — 100% Real-Time 3D Luxury Real Estate & Savings Game

**Tha Crib** is an architectural wealth-building and real estate simulation game where players manage savings portfolios, compound capital, and unlock the world's most prestigious estates.

The game is built with a **100% real-time 3D WebGL scene** (Three.js) — **zero static background pictures** — featuring physical PBR materials, volumetric RTX sun rays, an animated water normal map infinity pool, and tactile 3D interactive menu controls.

---

## ✨ Features

- **🏛️ 100% Real-Time 3D Architectural Villa**: Multi-tier modernist cantilevered pavilion rendered live in WebGL with soft shadow mapping and warm interior lighting.
- **☀️ Volumetric RTX Sun Ray Sky**: Real-time atmospheric Rayleigh/Mie scattering sky with glowing sun, radiant corona, and volumetric god ray light shafts cutting across the architecture.
- **🌊 Physical Infinity Pool with Water Normals**: Uses high-performance water normal mapping with undulating ripples, specular shimmer, and underwater illumination.
- **💎 Real PBR Textures**:
  - `travertine`: Polished Italian limestone slabs with natural veining
  - `hardwood2`: Architectural teak/walnut decking with diffuse, bump, and roughness maps
  - `carbon`: Carbon-fiber composite splitters and columns
  - `lensflare`: Realistic optical sun corona elements
- **🕹️ Tactile 3D Action Buttons**:
  - `[ 01 ]` **START GAME**: Access career savings vaults and launch or resume careers.
  - `[ 02 ]` **USER PROFILE**: High-roller financial dossier, custom insignia avatars (👑, 💎, 🏎️, 🏰, etc.), net worth tracker, and unlocked estate milestones.
  - `[ 03 ]` **SETTINGS**: Real-time audio sliders, 3D mouse parallax toggle, water ripple controls, and career reset options.
- **🎨 Live Luxury Theme Accent Switcher**:
  - Champagne Gold (Default)
  - Ice Platinum
  - Rose Gold
  - Imperial Emerald
- **🎵 Penthouse Ambient Rhodes Sound Engine**: Pure Web Audio API synthesizers playing warm, velvet twilight chords and champagne-glass acoustic UI feedback.
- **🌐 100% Serverless & GitHub Ready**: Ready to push to GitHub and host worldwide for free on GitHub Pages.

---

## 🚀 How to Run Locally

### Option 1: Instant Browser Launch
Double click [`index.html`](file:///c:/Users/jacep/OneDrive/Desktop/The%20crib/index.html) in your file explorer.

### Option 2: Local Web Server via Python
```powershell
python -m http.server 4567
```
Then open [http://localhost:4567](http://localhost:4567) in your browser.

### Option 3: Local Web Server via Node
```powershell
npm start
```
Then open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ How to Deploy to GitHub (Free GitHub Pages Server)

1. Create a repository on GitHub (e.g. `the-crib`).
2. Run in terminal:
   ```powershell
   git init
   git add .
   git commit -m "Launch Tha Crib 3D Menu"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/the-crib.git
   git push -u origin main
   ```
3. In GitHub, go to **Settings** &rarr; **Pages** &rarr; Select `main` branch &rarr; Click **Save**.
4. Your 3D game will be live worldwide at:
   `https://YOUR_USERNAME.github.io/the-crib/`
