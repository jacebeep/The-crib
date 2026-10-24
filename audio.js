/**
 * THA CRIB — QUIET LUXURY AMBIENT SOUND SYSTEM
 * Theme music: Lil Baby playlist streamed through a hidden YouTube player (auto-starts).
 * Pure Web Audio API — acoustic glass chimes and tactile 3D clicks.
 * Soft Penthouse Rhodes chords remain as an offline fallback if YouTube can't load.
 */

// YouTube playlist used as the theme music ("Lil baby Hits").
// Swap this id for any other public YouTube playlist to change the music.
const THEME_PLAYLIST_ID = 'PLkhlkBjrynK3BWg31ymSAlSJqp2m3ANNa';

class LuxuryAudioManager {
  constructor() {
    this.ctx = null;
    this.musicVolume = 0.65;
    this.sfxVolume = 0.8;
    this.isMuted = false; // music on by default; starts on load or on the first tap if the browser blocks autoplay

    // YouTube theme music state
    this.playlistId = THEME_PLAYLIST_ID;
    this.yt = null;
    this.ytReady = false;
    this.ytFailed = false;
    this.shuffled = false;
    this.lastTitle = '';

    this.musicGain = null;
    this.sfxGain = null;
    this.masterGain = null;
    this.ambientInterval = null;
    this.chordStep = 0;

    // Elegant High-Society Penthouse Chords (FMaj9, Dmin11, Gmin9, C13sus)
    this.chords = [
      [174.61, 261.63, 329.63, 392.00, 523.25], // FMaj9   (F3, C4, E4, G4, C5)
      [146.83, 220.00, 261.63, 329.63, 440.00], // Dmin11  (D3, A3, C4, E4, A4)
      [196.00, 293.66, 349.23, 440.00, 587.33], // Gmin9   (G3, D4, F4, A4, D5)
      [130.81, 196.00, 293.66, 349.23, 440.00]  // C13sus  (C3, G3, D4, F4, A4)
    ];

    this.initYouTube();
    this.armAutostart();
  }

  // ============================================================
  // THEME MUSIC — hidden YouTube playlist player
  // ============================================================
  initYouTube() {
    if (typeof document === 'undefined') return;
    const mount = () => {
      // YouTube needs a 200x200 player to play, so park it off-screen instead of display:none
      const holder = document.createElement('div');
      holder.id = 'yt-music-holder';
      holder.setAttribute('aria-hidden', 'true');
      holder.style.cssText =
        'position:fixed;left:-10000px;top:0;width:200px;height:200px;opacity:0;pointer-events:none;';
      const target = document.createElement('div');
      target.id = 'yt-music';
      holder.appendChild(target);
      document.body.appendChild(holder);

      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === 'function') prevReady();
        this.createPlayer();
      };

      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => this.fallbackToRhodes();
      document.head.appendChild(s);

      // offline / blocked: fall back to the built-in Rhodes loop
      this.ytTimeout = setTimeout(() => {
        if (!this.ytReady) this.fallbackToRhodes();
      }, 12000);
    };
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  createPlayer() {
    if (!window.YT || !window.YT.Player) return this.fallbackToRhodes();
    this.yt = new window.YT.Player('yt-music', {
      width: 200,
      height: 200,
      playerVars: {
        listType: 'playlist',
        list: this.playlistId,
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        playsinline: 1,
        loop: 1,
        rel: 0
      },
      events: {
        onReady: () => {
          this.ytReady = true;
          clearTimeout(this.ytTimeout);
          if (this.ytFailed) {
            // YouTube showed up late — swap the fallback out
            this.ytFailed = false;
            this.stopAmbientLoop();
          }
          this.yt.setVolume(Math.round(this.musicVolume * 100));
          this.yt.setLoop(true);
          if (!this.isMuted) this.playMusic();
        },
        onStateChange: (e) => {
          if (e.data !== window.YT.PlayerState.PLAYING) return;
          // shuffle once the playlist has loaded so every visit sounds different
          if (!this.shuffled) {
            const list = this.yt.getPlaylist && this.yt.getPlaylist();
            if (list && list.length) {
              this.shuffled = true;
              this.yt.setShuffle(true);
            }
          }
          if (this.isMuted) {
            this.yt.pauseVideo();
            return;
          }
          const data = this.yt.getVideoData ? this.yt.getVideoData() : null;
          const title = data && data.title;
          if (title && title !== this.lastTitle) {
            this.lastTitle = title;
            window.dispatchEvent(new CustomEvent('crib:nowplaying', { detail: { title } }));
          }
        },
        // video blocked from embedding / removed: skip it
        onError: () => {
          try { this.yt.nextVideo(); } catch (_) { /* ignore */ }
        }
      }
    });
  }

  fallbackToRhodes() {
    if (this.ytReady) return;
    this.ytFailed = true;
    clearTimeout(this.ytTimeout);
    if (!this.isMuted && this.ctx && this.ctx.state === 'running') this.startAmbientLoop();
  }

  playMusic() {
    if (this.isMuted) return;
    if (this.ytReady && this.yt) {
      this.yt.unMute();
      this.yt.setVolume(Math.round(this.musicVolume * 100));
      this.yt.playVideo();
    } else if (this.ytFailed) {
      this.ensureContext();
      this.startAmbientLoop();
    }
  }

  pauseMusic() {
    if (this.ytReady && this.yt) this.yt.pauseVideo();
    this.stopAmbientLoop();
  }

  // Browsers block sound until the user interacts with the page once.
  // So: try right away, and also start on the very first tap / click / key press anywhere.
  armAutostart() {
    if (typeof document === 'undefined') return;
    const events = ['pointerdown', 'touchstart', 'keydown'];
    const unlock = () => {
      this.ensureContext();
      if (!this.isMuted) this.playMusic();
      // keep listening until the player actually exists, then stop
      if (this.ytReady || this.ytFailed) {
        events.forEach((ev) => document.removeEventListener(ev, unlock, true));
      }
    };
    events.forEach((ev) => document.addEventListener(ev, unlock, true));
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound() {
    this.ensureContext();
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.pauseMusic();
      return false;
    } else {
      this.masterGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.1);
      this.playMusic();
      this.playGlassChime();
      return true;
    }
  }

  setMusicVolume(pct) {
    this.musicVolume = pct / 100;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
    }
    if (this.ytReady && this.yt) this.yt.setVolume(Math.round(this.musicVolume * 100));
  }

  setSfxVolume(pct) {
    this.sfxVolume = pct / 100;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
    }
  }

  // --- Ambient Music Loop: Soft Penthouse Rhodes Chords ---
  startAmbientLoop() {
    if (this.ambientInterval) return;
    this.playAmbientChord();
    this.ambientInterval = setInterval(() => {
      this.chordStep = (this.chordStep + 1) % this.chords.length;
      this.playAmbientChord();
    }, 4800);
  }

  stopAmbientLoop() {
    if (this.ambientInterval) {
      clearInterval(this.ambientInterval);
      this.ambientInterval = null;
    }
  }

  playAmbientChord() {
    if (this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const chord = this.chords[this.chordStep];
    const duration = 4.6;

    // Warm high-end acoustic filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 1.2);
    filter.frequency.exponentialRampToValueAtTime(600, now + duration);
    filter.connect(this.musicGain);

    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Subtle warm detuning
      osc.detune.setValueAtTime((Math.random() - 0.5) * 6, now);

      // Smooth velvet envelope
      oscGain.gain.setValueAtTime(0, now);
      oscGain.gain.linearRampToValueAtTime(0.04, now + 0.9);
      oscGain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

      osc.connect(oscGain);
      oscGain.connect(filter);

      osc.start(now);
      osc.stop(now + duration);
    });
  }

  // --- SFX: Tactile 3D Button Hover (Refined Champagne Ping) ---
  playHover() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1174.66, now); // D6
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.06);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  // --- SFX: Tactile 3D Button Click (Subtle Solid Obsidian Click) ---
  playClick() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  // --- SFX: Modal Open Sweep ---
  playModalOpen() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.22);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  // --- SFX: Save Career Select / Vault Unlock Chime ---
  playCashChime() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const freqs = [880, 1108.73, 1318.51, 1760]; // A5, C#6, E6, A6 (Pure A Major luxury bell chord)
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.04);

      gain.gain.setValueAtTime(0, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.07, now + i * 0.04 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.04 + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.4);
    });
  }

  playGlassChime() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  // ============================================================
  // CINEMATIC ENTRANCE SFX
  // ============================================================
  noiseBuffer() {
    if (!this._noise) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noise = buf;
    }
    return this._noise;
  }

  // filtered air sweep for the camera flight
  playWhoosh(duration = 3) {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(220, now);
    bp.frequency.exponentialRampToValueAtTime(900, now + duration * 0.55);
    bp.frequency.exponentialRampToValueAtTime(260, now + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  // latch click + heavy pivot thud + air rushing in from the house
  playDoorOpen() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const latch = this.ctx.createOscillator();
    const latchGain = this.ctx.createGain();
    latch.type = 'triangle';
    latch.frequency.setValueAtTime(1800, now);
    latch.frequency.exponentialRampToValueAtTime(600, now + 0.04);
    latchGain.gain.setValueAtTime(0.12, now);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    latch.connect(latchGain);
    latchGain.connect(this.sfxGain);
    latch.start(now);
    latch.stop(now + 0.07);

    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(85, now + 0.08);
    thud.frequency.exponentialRampToValueAtTime(42, now + 0.6);
    thudGain.gain.setValueAtTime(0.0001, now + 0.08);
    thudGain.gain.linearRampToValueAtTime(0.22, now + 0.12);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    thud.connect(thudGain);
    thudGain.connect(this.sfxGain);
    thud.start(now + 0.08);
    thud.stop(now + 0.8);

    const air = this.ctx.createBufferSource();
    air.buffer = this.noiseBuffer();
    air.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(300, now);
    lp.frequency.exponentialRampToValueAtTime(2400, now + 1.0);
    lp.frequency.exponentialRampToValueAtTime(500, now + 2.0);
    const airGain = this.ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, now);
    airGain.gain.exponentialRampToValueAtTime(0.06, now + 0.7);
    airGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
    air.connect(lp);
    lp.connect(airGain);
    airGain.connect(this.sfxGain);
    air.start(now);
    air.stop(now + 2.05);
  }

  playDoorClose() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime + 1.3; // lands as the leaves meet
    const thud = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(95, now);
    thud.frequency.exponentialRampToValueAtTime(40, now + 0.5);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    thud.connect(gain);
    gain.connect(this.sfxGain);
    thud.start(now);
    thud.stop(now + 0.65);
  }

  // warm FMaj9 bell arpeggio as you cross the threshold
  playWelcome() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    [349.23, 440.0, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = now + i * 0.09;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.05, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 1.45);
    });
  }

  // profile chosen: soft low swell + bright bell
  playProfileSelect() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    const low = this.ctx.createOscillator();
    const lowGain = this.ctx.createGain();
    low.type = 'triangle';
    low.frequency.setValueAtTime(174.61, now);
    lowGain.gain.setValueAtTime(0.0001, now);
    lowGain.gain.linearRampToValueAtTime(0.09, now + 0.05);
    lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    low.connect(lowGain);
    lowGain.connect(this.sfxGain);
    low.start(now);
    low.stop(now + 1.25);
    this.playCashChime();
  }

  // wrong passcode: two soft descending tones
  playError() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    [[330, 0], [247, 0.13]].forEach(([f, d]) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + d);
      gain.gain.setValueAtTime(0.0001, now + d);
      gain.gain.linearRampToValueAtTime(0.12, now + d + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + d);
      osc.stop(now + d + 0.25);
    });
  }

  // dry-erase marker squeak (writing on the whiteboard)
  playMarker() {
    if (this.isMuted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.11;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.setValueAtTime(2600 + i * 400, t);
      bp.frequency.linearRampToValueAtTime(3400 + i * 300, t + 0.08);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(this.sfxGain);
      src.start(t, Math.random());
      src.stop(t + 0.1);
    }
  }
}

window.gameAudio = new LuxuryAudioManager();
