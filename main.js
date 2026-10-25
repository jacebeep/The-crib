/**
 * THA CRIB — QUIET LUXURY CONTROLLER & 3D INTERACTION ENGINE
 */

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // safe sound-effect helper (audio engine may be missing or muted)
  const sfx = (name, ...args) => {
    const a = window.gameAudio;
    if (a && typeof a[name] === 'function') a[name](...args);
  };

  // installable app + offline support (needs http/https, e.g. GitHub Pages)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* non-fatal */ });
  }

  // --- DOM Elements ---
  const all3DButtons = document.querySelectorAll('.btn-luxury-3d');

  // Audio Controls
  const soundToggleBtn = $('btn-sound-toggle');
  const soundLabel = $('sound-label');

  // Modals
  const modalSettings = $('modal-settings');
  const modalDeploy = $('modal-deploy');

  // Triggers
  const btnStart = $('btn-start');
  const btnSettings = $('btn-settings');
  const btnDeployInfo = $('btn-deploy-info');

  // Entrance cinematic + profile select
  const profileSelect = $('profile-select');
  const psCards = $('ps-cards');
  const psWelcomeName = $('ps-welcome-name');
  const btnLeaveCrib = $('btn-leave-crib');
  const btnCommunity = $('btn-community');
  const btnSkipCine = $('btn-skip-cine');
  const thresholdGlow = $('threshold-glow');
  const cineCaptionKicker = $('cine-caption-kicker');

  // Passcode prompt
  const psPassForm = $('ps-pass-form');
  const psPassInitial = $('ps-pass-initial');
  const psPassTitle = $('ps-pass-title');
  const psPassInput = $('ps-pass-input');
  const psPassEye = $('ps-pass-eye');
  const psPassError = $('ps-pass-error');
  const psPassBack = $('ps-pass-back');

  // Whiteboard
  const boardView = $('board-view');
  const whiteboard = $('whiteboard');
  const wbTitle = $('wb-title');
  const wbGoalVal = $('wb-goal-val');
  const wbGoalSub = $('wb-goal-sub');
  const wbOverallNum = $('wb-overall-num');
  const wbOverallPct = $('wb-overall-pct');
  const wbTrackFill = $('wb-track-fill');
  const wbPlane = $('wb-plane');
  const wbGrid = $('wb-grid');
  const depositForm = $('deposit-form');
  const depositAmount = $('deposit-amount');
  const depositQuick = $('deposit-quick');
  const depositPreview = $('deposit-preview');
  const depositLog = $('deposit-log');

  // Community whiteboard
  const communityView = $('community-view');
  const communityBoard = $('community-board');
  const cbTotalVal = $('cb-total-val');
  const cbTotalSub = $('cb-total-sub');
  const cbOverallNum = $('cb-overall-num');
  const cbOverallPct = $('cb-overall-pct');
  const cbTrackFill = $('cb-track-fill');
  const cbPlane = $('cb-plane');
  const cbLegend = $('cb-legend');
  const cbPeople = $('cb-people');
  const cbLead = $('cb-lead');
  const cbFeed = $('cb-feed');

  // Theme Switcher
  const themeDots = document.querySelectorAll('.theme-dot');

  // Toast
  const toast = $('toast-notify');

  // Load Saved Theme
  const savedTheme = localStorage.getItem('the_crib_theme') || 'champagne';
  applyTheme(savedTheme);

  themeDots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const theme = dot.getAttribute('data-theme');
      applyTheme(theme);
      sfx('playHover');
      showToast(`Luxury Theme: ${theme.toUpperCase()}`);
    });
  });

  function applyTheme(themeName) {
    // only swap the theme class so cinematic state classes (cine-active / in-crib) survive
    Array.from(document.body.classList)
      .filter((c) => c.startsWith('theme-'))
      .forEach((c) => document.body.classList.remove(c));
    document.body.classList.add(`theme-${themeName}`);
    localStorage.setItem('the_crib_theme', themeName);

    themeDots.forEach((d) => {
      d.classList.toggle('active', d.getAttribute('data-theme') === themeName);
    });
  }

  // ============================================================
  // 1. TACTILE 3D BUTTON TILT (PHYSICAL RESPONSE)
  // ============================================================
  all3DButtons.forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const tiltX = -((y - centerY) / centerY) * 10;
      const tiltY = ((x - centerX) / centerX) * 10;

      btn.style.transform = `perspective(600px) rotateX(${tiltX.toFixed(1)}deg) rotateY(${tiltY.toFixed(1)}deg) translateY(-4px) translateZ(24px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });

    // Sound feedback
    btn.addEventListener('mouseenter', () => sfx('playHover'));
    btn.addEventListener('click', () => sfx('playClick'));
  });

  // ============================================================
  // 2. AUDIO TOGGLE & AMBIENT MUSIC
  // ============================================================
  function syncSoundButton(isActive) {
    soundToggleBtn.classList.toggle('active', isActive);
    soundLabel.textContent = isActive ? 'Audio: ON' : 'Audio: OFF';
  }
  // music is on by default (audio.js auto-starts it)
  syncSoundButton(!!(window.gameAudio && !window.gameAudio.isMuted));

  soundToggleBtn.addEventListener('click', () => {
    if (!window.gameAudio) return;
    const isActive = window.gameAudio.toggleSound();
    syncSoundButton(isActive);
    showToast(isActive ? '🎵 Lil Baby Playlist On' : '🔇 Audio Muted');
  });

  window.addEventListener('crib:nowplaying', (e) => {
    const title = e.detail && e.detail.title;
    if (title) showToast(`🎵 Now Playing: ${title}`);
  });

  // ============================================================
  // 3. MODALS
  // ============================================================
  function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('open');
    sfx('playModalOpen');
  }

  function closeModal(modalEl) {
    if (!modalEl || !modalEl.classList.contains('open')) return;
    modalEl.classList.remove('open');
    sfx('playHover');
  }

  btnStart.addEventListener('click', () => enterCrib());
  btnSettings.addEventListener('click', () => openModal(modalSettings));
  btnDeployInfo.addEventListener('click', () => openModal(modalDeploy));

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal($(btn.getAttribute('data-close'))));
  });

  document.querySelectorAll('.modal-backdrop').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (crib.state === 'entering' || crib.state === 'leaving' || crib.state === 'moving' || crib.state === 'toBar' || crib.state === 'fromBar') {
        skipCinematic();
        return;
      }
      if (crib.state === 'bar') {
        closeBar();
        return;
      }
      if (crib.state === 'locking') {
        closePasscode();
        return;
      }
      if (crib.state === 'community') {
        closeCommunity();
        return;
      }
      document.querySelectorAll('.modal-backdrop.open').forEach(closeModal);
      return;
    }
    if (isTyping(e.target)) return;
    // quick-pick profiles with 1 / 2 / 3
    const idx = ['1', '2', '3'].indexOf(e.key);
    if (idx >= 0 && crib.state === 'inside' && profileSelect.classList.contains('open') && !document.querySelector('.modal-backdrop.open')) {
      selectProfile(PROFILES[idx].id);
    }
  });

  // ============================================================
  // 4. PROFILES, PASSCODES & FLORIDA BUDGETS (all money in cents)
  // ============================================================
  // Passwords are stored exclusively as one-way SHA-256 hashes.
  // Neither the code nor an external observer can read the plaintext passwords.
  const PROFILES = [
    {
      id: 'jace', name: 'Jace', initial: 'J', role: 'The Architect', insignia: '👑',
      codeHash: 'a2d12f1bb27e4a7d5c5291c1ce5fb411195d44f727ce4386978d030fa49bf390',
      ink: '#a16207',
      c1: '#fff3c4', c2: '#d4af37', c3: '#8c6d1d',
      items: [
        { key: 'rent', label: 'Rent', goal: 71456 },
        { key: 'deposit', label: 'Deposit', goal: 58540 },
        { key: 'highrisk', label: 'High Risk Deposit', goal: 48530 },
        { key: 'utilities', label: 'Utilities', goal: 17090 },
        { key: 'food', label: 'Food', goal: 25000 },
        { key: 'internet', label: 'Internet', goal: 2160 }
      ]
    },
    {
      id: 'koda', name: 'Koda', initial: 'K', role: 'The Closer', insignia: '🏎️',
      codeHash: '0fcb77e9e0077de5e520622bff1356c0e191146188f53e0011ddbd327f293896',
      ink: '#0369a1',
      c1: '#d6f6ff', c2: '#38bdf8', c3: '#0e5a8a',
      items: [
        { key: 'rent', label: 'Rent', goal: 71456 },
        { key: 'deposit', label: 'Deposit', goal: 58440 },
        { key: 'highrisk', label: 'High Risk Deposit', goal: 48530 },
        { key: 'utilities', label: 'Utilities', goal: 17090 },
        { key: 'carplane', label: 'The Car / Plane', goal: 1000000 },
        { key: 'food', label: 'Food', goal: 15000 },
        { key: 'pet', label: 'Pet', goal: 35000 },
        { key: 'internet', label: 'Internet', goal: 2160 }
      ]
    },
    {
      id: 'shayne', name: 'Shayne', initial: 'S', role: 'The Visionary', insignia: '💎',
      codeHash: '3f131f54d3fe14a02535ed2940dc0dde4327e722317d4916f476d751aaa69671',
      ink: '#9333ea',
      c1: '#fde4f2', c2: '#d08cf0', c3: '#6b2f8f',
      items: [
        { key: 'rent', label: "First Month's Rent", goal: 43334 },
        { key: 'deposit', label: 'Deposit', goal: 43330 },
        { key: 'highrisk', label: 'High Risk Deposit', goal: 33330 },
        { key: 'utilities', label: 'Utilities', goal: 16660 },
        { key: 'food', label: 'Food', goal: 25000 },
        { key: 'pet', label: 'Pet', goal: 25000 },
        { key: 'internet', label: 'Internet', goal: 2160 }
      ]
    }
  ];

  // Cryptographic hash helper (SHA-256 with pure fallback)
  function sha256Sync(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const mathPow = Math.pow;
    const maxWord = mathPow(2, 32);
    let i, j;
    let result = '';
    const words = [];
    const asciiBitLength = ascii.length * 8;
    let hash = [];
    const k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = candidate * candidate; i < 313; i += candidate) isComposite[i] = true;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    words.length = ((asciiBitLength + 64 >>> 9) << 4) + 16;
    for (i = 0; i < words.length; i++) words[i] = 0;
    for (i = 0; i < ascii.length; i++) words[i >>> 2] |= (ascii.charCodeAt(i) & 255) << (24 - (i % 4) * 8);
    words[asciiBitLength >>> 5] |= 0x80 << (24 - (asciiBitLength % 32));
    words[words.length - 1] = asciiBitLength;
    for (j = 0; j < words.length; j += 16) {
      const w = words.slice(j, j + 16);
      const oldHash = hash.slice(0);
      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = (hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ (~e & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? (w[i] | 0) : (
            (w[i - 16] | 0)
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + (w[i - 7] | 0)
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0)) | 0;
        const temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
        hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (let b = 3; b >= 0; b--) {
        const byte = (hash[i] >>> (b * 8)) & 255;
        result += (byte < 16 ? '0' : '') + byte.toString(16);
      }
    }
    return result;
  }

  async function computeCodeHash(val) {
    const text = String(val || '').trim().toLowerCase();
    if (!text) return '';
    try {
      if (window.crypto && crypto.subtle) {
        const enc = new TextEncoder().encode(text);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (_) { }
    return sha256Sync(text);
  }

  const INKS = {
    rent: '#1d4ed8', deposit: '#dc2626', highrisk: '#ea580c', utilities: '#15803d',
    carplane: '#7e22ce', food: '#b45309', pet: '#db2777', internet: '#111827'
  };
  const ICONS = {
    rent: '🏠', deposit: '💵', highrisk: '⚠️', utilities: '💡',
    carplane: '🚗✈️', food: '🍔', pet: '🐾', internet: '📶'
  };

  const crib = {
    state: 'menu',        // 'menu' | 'entering' | 'inside' | 'locking' | 'moving' | 'board' | 'community' | 'leaving' | 'toBar' | 'bar' | 'fromBar'
    profile: null,
    selecting: false,
    communityFrom: 'profiles',
    unlockedProfiles: new Set()
  };

  // --- money helpers ---
  const fmt = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const toCents = (raw) => {
    const n = Number(String(raw).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };
  const goalOf = (p) => p.items.reduce((s, it) => s + it.goal, 0);
  const pctText = (f) => {
    const p = f * 100;
    if (p >= 100) return '100%';
    if (p > 0 && p < 1) return '<1%';
    return `${Math.floor(p)}%`;
  };

  /**
   * Split `savedCents` across the items in proportion to each goal
   * (largest-remainder rounding so the cents always add up exactly).
   */
  function allocate(savedCents, items) {
    const total = items.reduce((s, it) => s + it.goal, 0);
    const pool = Math.min(savedCents, total);
    const raw = items.map((it) => (pool * it.goal) / total);
    const out = raw.map(Math.floor);
    let rem = pool - out.reduce((a, b) => a + b, 0);
    raw.map((r, i) => ({ i, f: r - out[i] }))
      .sort((a, b) => b.f - a.f)
      .forEach(({ i }) => { if (rem > 0) { out[i] += 1; rem -= 1; } });
    return out;
  }

  // how a new deposit lands on each expense, given what is already saved
  function splitFor(savedCents, amount, p) {
    const before = allocate(savedCents, p.items);
    const after = allocate(savedCents + amount, p.items);
    const total = goalOf(p);
    return {
      parts: p.items.map((it, i) => ({ it, c: after[i] - before[i] })),
      extra: Math.max(0, savedCents + amount - total) - Math.max(0, savedCents - total)
    };
  }

  // --- storage (live-synced between phones when Firebase is set up; see sync.js) ---
  const sync = window.createCribSync({
    profiles: PROFILES.map((p) => p.id),
    onChange: onBoardsChanged,
    onStatus: setSyncStatus,
    onPresence: refreshPresence,
    onRemoteDeposit: (id, entry) => {
      const who = PROFILES.find((p) => p.id === id);
      if (!who || crib.state === 'menu') return;
      showToast(`💸 ${who.name} just put in ${fmt(entry.c)}!`);
      sfx('playCashChime');
    }
  });

  const loadBoard = (id) => ({ deposits: sync.get(id) });
  const savedOf = (d) => d.deposits.reduce((s, x) => s + (Number(x.c) || 0), 0);

  // someone (here or on another phone) changed a board: redraw whatever is open
  function onBoardsChanged(id) {
    if (crib.state === 'board' && crib.profile && crib.profile.id === id) updateBoard();
    if (crib.state === 'community') refreshCommunityLive();
  }

  // who's online / last visits changed
  function refreshPresence() {
    psCards.querySelectorAll('.ps-card').forEach((card) => {
      const id = card.dataset.profile;
      const on = sync.isOnline(id);
      card.classList.toggle('online', on);
      const t = card.querySelector('.ps-meta-time');
      if (t) t.textContent = on ? '🟢 On now' : timeAgo(sync.lastVisit(id));
    });
    if (crib.state === 'community') refreshCommunityLive();
  }

  const syncDot = $('sync-dot');
  const SYNC_LABELS = {
    live: 'Live: syncing with everyone',
    connecting: 'Reconnecting… changes will sync when back online',
    local: 'Saved on this device only',
    nodb: 'Live database not set up yet: saving on this device for now',
    error: 'Sync problem: check the Firebase database rules'
  };
  function setSyncStatus(status) {
    if (!syncDot) return;
    syncDot.className = `sync-dot ${status}`;
    syncDot.title = SYNC_LABELS[status] || '';
    syncDot.setAttribute('aria-label', SYNC_LABELS[status] || 'Sync status');
  }

  function timeAgo(ts) {
    if (!ts) return 'First visit';
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const dateText = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  const profileVars = (p) => `--p1:${p.c1};--p2:${p.c2};--p3:${p.c3}`;

  const LOCK_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg>';

  // ============================================================
  // 5. PROFILE SELECT ("WHO'S HOME?") + PASSCODE
  // ============================================================
  function renderProfileCards() {
    const lastId = localStorage.getItem('the_crib_active_profile');
    psCards.classList.remove('has-choice');
    psCards.innerHTML = PROFILES.map((p, i) => {
      const lastVisit = sync.lastVisit(p.id);
      const on = sync.isOnline(p.id);
      return `
        <button class="ps-card${on ? ' online' : ''}" id="profile-card-${p.id}" data-profile="${p.id}" style="${profileVars(p)};--i:${i}" aria-label="Unlock ${p.name}'s board">
          <span class="ps-card-glow"></span>
          <span class="ps-key">${i + 1}</span>
          ${lastId === p.id ? '<span class="ps-badge">LAST ACTIVE</span>' : ''}
          <span class="ps-avatar">
            <span class="ps-avatar-ring"></span>
            <span class="ps-initial">${p.initial}</span>
            <span class="ps-insignia">${p.insignia}</span>
          </span>
          <span class="ps-name">${p.name}</span>
          <span class="ps-role">${p.role}</span>
          <span class="ps-lockline">${LOCK_SVG} Code Required</span>
          <span class="ps-meta"><span>🌴 Florida Board</span><span class="ps-meta-time">${on ? '🟢 On now' : timeAgo(lastVisit)}</span></span>
          <span class="ps-enter">UNLOCK
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>
          </span>
        </button>`;
    }).join('');

    psCards.querySelectorAll('.ps-card').forEach((card) => {
      card.addEventListener('mouseenter', () => sfx('playHover'));
      card.addEventListener('mousemove', (e) => {
        if (crib.selecting) return;
        const r = card.getBoundingClientRect();
        const rx = -(((e.clientY - r.top) / r.height) - 0.5) * 12;
        const ry = (((e.clientX - r.left) / r.width) - 0.5) * 12;
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) translateY(-10px)`;
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
      card.addEventListener('click', () => selectProfile(card.dataset.profile));
    });
  }

  function showProfileSelect() {
    crib.selecting = false;
    renderProfileCards();
    updateCommunityLockUI();
    profileSelect.classList.remove('welcoming', 'locking');
    profileSelect.classList.add('open');
  }

  function hideProfileSelect() {
    profileSelect.classList.remove('open');
    setTimeout(() => {
      if (!profileSelect.classList.contains('open')) profileSelect.classList.remove('welcoming', 'locking');
    }, 750);
  }

  function selectProfile(id) {
    if (crib.state !== 'inside' || crib.selecting) return;
    const p = PROFILES.find((x) => x.id === id);
    if (!p) return;
    crib.selecting = true;
    crib.profile = p;
    sfx('playClick');

    psCards.classList.add('has-choice');
    psCards.querySelectorAll('.ps-card').forEach((card) => {
      card.style.transform = '';
      card.classList.add(card.dataset.profile === id ? 'chosen' : 'dismissed');
    });

    setTimeout(() => openPasscode(p), 450);
  }

  function openPasscode(p) {
    crib.state = 'locking';
    psPassForm.setAttribute('style', profileVars(p));
    psPassForm.classList.remove('unlocked', 'shake');
    psPassInitial.textContent = p.initial;
    psPassTitle.textContent = `Enter ${p.name}'s Code`;
    psPassInput.value = '';
    psPassInput.type = 'password';
    psPassEye.textContent = 'SHOW';
    psPassEye.setAttribute('aria-label', 'Show code');
    psPassError.textContent = '';
    profileSelect.classList.add('locking');
    sfx('playModalOpen');
    setTimeout(() => psPassInput.focus(), 350);
  }

  function closePasscode() {
    if (crib.state !== 'locking') return;
    crib.state = 'inside';
    crib.profile = null;
    psPassInput.blur();
    profileSelect.classList.remove('locking');
    sfx('playHover');
    showProfileSelect();
  }

  psPassBack.addEventListener('click', closePasscode);

  psPassEye.addEventListener('click', () => {
    const show = psPassInput.type === 'password';
    psPassInput.type = show ? 'text' : 'password';
    psPassEye.textContent = show ? 'HIDE' : 'SHOW';
    psPassEye.setAttribute('aria-label', show ? 'Hide code' : 'Show code');
    psPassInput.focus();
  });

  psPassInput.addEventListener('input', () => { psPassError.textContent = ''; });

  psPassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (crib.state !== 'locking' || !crib.profile) return;
    const p = crib.profile;
    const guess = psPassInput.value.trim();

    if (!guess) {
      psPassError.textContent = 'Type your code first.';
      psPassForm.classList.remove('shake');
      void psPassForm.offsetWidth; // restart the shake
      psPassForm.classList.add('shake');
      sfx('playError');
      psPassInput.select();
      return;
    }

    const hash = await computeCodeHash(guess);
    if (hash !== p.codeHash) {
      psPassError.textContent = 'Wrong code. Try again.';
      psPassForm.classList.remove('shake');
      void psPassForm.offsetWidth; // restart the shake
      psPassForm.classList.add('shake');
      sfx('playError');
      psPassInput.select();
      return;
    }
    unlockProfile(p);
  });

  function updateCommunityLockUI() {
    if (!btnCommunity) return;
    const isUnlocked = crib.unlockedProfiles && crib.unlockedProfiles.size > 0;
    btnCommunity.classList.toggle('locked', !isUnlocked);
    btnCommunity.classList.toggle('unlocked', isUnlocked);
    btnCommunity.setAttribute('aria-label', isUnlocked ? 'Community Board' : 'Community Board (Locked — unlock a profile first)');
    const tag = btnCommunity.querySelector('.cb-lock-tag');
    if (tag) tag.textContent = isUnlocked ? 'UNLOCKED' : 'LOCKED';
    const lockIcon = btnCommunity.querySelector('.cb-lock-icon');
    if (lockIcon) lockIcon.textContent = isUnlocked ? '🔓' : '🔒';
  }

  function unlockProfile(p) {
    crib.state = 'moving';
    crib.unlockedProfiles.add(p.id);
    updateCommunityLockUI();
    psPassForm.classList.add('unlocked');
    psPassInput.blur();
    sfx('playProfileSelect');

    localStorage.setItem('the_crib_active_profile', p.id);
    sync.markVisit(p.id);

    setTimeout(() => {
      psWelcomeName.textContent = `Welcome home, ${p.name}`;
      profileSelect.classList.add('welcoming');
    }, 350);

    setTimeout(() => {
      hideProfileSelect();
      buildBoard(p);
      const scene = window.luxury3d;
      const walk = scene && scene.goToBoard ? scene.goToBoard(onCineEvent) : Promise.resolve();
      const early = setTimeout(openBoard, 1900); // fade the board in just before arrival
      walk.then(() => { clearTimeout(early); openBoard(); });
    }, 2000);
  }

  // ============================================================
  // 6. THE FLORIDA WHITEBOARD
  // ============================================================
  function buildBoard(p) {
    const total = goalOf(p);
    wbTitle.textContent = `${p.name}'s Florida Fund`;
    wbGoalVal.textContent = fmt(total);
    whiteboard.classList.remove('complete');
    wbTrackFill.style.width = '0';
    wbPlane.style.left = '5px';
    wbOverallNum.textContent = fmt(0);
    wbOverallPct.textContent = '0%';

    wbGrid.innerHTML = p.items.map((it, i) => `
      <article class="wb-item empty" id="wb-item-${it.key}" style="--ink:${INKS[it.key] || '#111827'};--i:${i}">
        <span class="wb-check" aria-hidden="true">✔</span>
        <div class="wb-ring-wrap">
          <svg class="wb-ring" viewBox="0 0 80 80" aria-hidden="true">
            <circle class="ring-track" cx="40" cy="40" r="32"></circle>
            <circle class="ring-fill" cx="40" cy="40" r="32" pathLength="100"></circle>
          </svg>
          <span class="wb-ring-pct">0%</span>
        </div>
        <div class="wb-item-body">
          <h3 class="wb-item-name"><span class="wb-item-icon" aria-hidden="true">${ICONS[it.key] || '📌'}</span>${it.label}</h3>
          <p class="wb-item-amt"><b>${fmt(0)}</b> / ${fmt(it.goal)}</p>
          <div class="wb-bar" role="progressbar" aria-label="${it.label} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="wb-bar-inner"><span class="wb-bar-fill"></span></span>
          </div>
          <p class="wb-item-left">${fmt(it.goal)} to go</p>
        </div>
      </article>`).join('');

    depositAmount.value = '';
    renderLog(loadBoard(p.id));
    renderPreview();
    if (wbGrid.parentElement) wbGrid.closest('.wb-surface').scrollTop = 0;
  }

  function updateBoard() {
    const p = crib.profile;
    if (!p) return;
    const d = loadBoard(p.id);
    const saved = savedOf(d);
    const total = goalOf(p);
    const alloc = allocate(saved, p.items);
    const frac = Math.min(1, saved / total);

    // overall bar + plane flying to Florida
    wbOverallNum.textContent = fmt(saved);
    wbOverallPct.textContent = pctText(frac);
    wbTrackFill.style.width = `calc((100% - 10px) * ${frac.toFixed(4)})`;
    wbPlane.style.left = `calc(5px + (100% - 10px) * ${frac.toFixed(4)})`;
    whiteboard.classList.toggle('complete', saved >= total);

    const left = Math.max(0, total - saved);
    const extra = Math.max(0, saved - total);
    wbGoalSub.textContent = extra > 0
      ? `Goal smashed! +${fmt(extra)} extra 🎉`
      : (left > 0 ? `${fmt(left)} left to save` : 'Goal reached! 🌴');

    // each expense: ring + bar
    p.items.forEach((it, i) => {
      const el = $(`wb-item-${it.key}`);
      if (!el) return;
      const a = alloc[i];
      const f = Math.min(1, a / it.goal);
      const pct = f * 100;
      el.querySelector('.ring-fill').style.strokeDashoffset = (100 - pct).toFixed(2);
      el.querySelector('.wb-ring-pct').textContent = pctText(f);
      el.querySelector('.wb-bar-fill').style.width = `${pct.toFixed(2)}%`;
      el.querySelector('.wb-bar').setAttribute('aria-valuenow', String(Math.floor(pct)));
      el.querySelector('.wb-item-amt b').textContent = fmt(a);
      el.querySelector('.wb-item-left').textContent = a >= it.goal ? 'Covered! ✅' : `${fmt(it.goal - a)} to go`;
      el.classList.toggle('done', a >= it.goal);
      el.classList.toggle('empty', a === 0);
    });

    renderLog(d);
    renderPreview();
  }

  function renderPreview() {
    const p = crib.profile;
    if (!p) return;
    const amt = toCents(depositAmount.value);
    if (!amt) {
      depositPreview.innerHTML = `<p class="dp-hint">Type how much you're putting in. It gets split across all ${p.items.length} expenses automatically.</p>`;
      return;
    }
    const saved = savedOf(loadBoard(p.id));
    const { parts, extra } = splitFor(saved, amt, p);
    const rows = parts
      .filter((x) => x.c > 0)
      .map((x) => `<span style="--ink:${INKS[x.it.key]}">${x.it.label}</span><span style="--ink:${INKS[x.it.key]}">+${fmt(x.c)}</span>`)
      .join('');
    depositPreview.innerHTML = `
      <p class="dp-title">${fmt(amt)} splits like this:</p>
      ${rows ? `<div class="dp-rows">${rows}</div>` : ''}
      ${extra > 0 ? `<p class="dp-extra">+${fmt(extra)} extra over the goal 🎉</p>` : ''}`;
  }

  function renderLog(d) {
    if (!d.deposits.length) {
      depositLog.innerHTML = '<li class="dl-empty">Nothing yet. Put your first money in!</li>';
      return;
    }
    const rows = d.deposits
      .slice()
      .reverse()
      .map((x) => `
        <li>
          <span class="dl-amt">+${fmt(x.c)}</span>
          <span class="dl-date">${dateText(x.t)}</span>
          <button type="button" class="dl-del" data-key="${x.k}" title="Erase this entry" aria-label="Erase ${fmt(x.c)} entry">×</button>
        </li>`)
      .join('');
    depositLog.innerHTML = `${rows}<li class="dl-total">Total in: ${fmt(savedOf(d))}</li>`;
  }

  function openBoard() {
    if (crib.state !== 'moving' || !crib.profile) return;
    crib.state = 'board';
    boardView.classList.add('open');
    sync.setPresence(crib.profile.id);
    sfx('playMarker');
    // let the board settle in, then "draw" the progress
    setTimeout(() => { if (crib.state === 'board') updateBoard(); }, 700);
  }

  function closeBoard() {
    boardView.classList.remove('open');
    depositAmount.blur();
    sync.setPresence(null);
  }

  // --- Put Money In ---
  depositAmount.addEventListener('input', renderPreview);

  depositQuick.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-add]');
    if (!btn) return;
    const next = toCents(depositAmount.value) + Math.round(Number(btn.dataset.add) * 100);
    depositAmount.value = (next / 100).toFixed(2);
    sfx('playHover');
    renderPreview();
  });

  depositForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = crib.profile;
    if (!p || crib.state !== 'board') return;
    const amt = toCents(depositAmount.value);

    if (!amt || amt > 100000000) {
      depositForm.classList.remove('shake');
      void depositForm.offsetWidth;
      depositForm.classList.add('shake');
      sfx('playError');
      showToast(amt ? '✏️ That amount is too big. Max $1,000,000 at a time.' : '✏️ Enter an amount greater than $0');
      depositAmount.focus();
      return;
    }

    const d = loadBoard(p.id);
    const { parts } = splitFor(savedOf(d), amt, p);
    sync.add(p.id, amt);

    depositAmount.value = '';
    sfx('playMarker');
    sfx('playCashChime');
    updateBoard();

    const touched = parts.filter((x) => x.c > 0).length;
    showToast(touched
      ? `✍️ ${fmt(amt)} added, split across ${touched} expense${touched === 1 ? '' : 's'}`
      : `✍️ ${fmt(amt)} added as extra. Every expense is already covered!`);
  });

  depositForm.addEventListener('animationend', () => depositForm.classList.remove('shake'));

  depositLog.addEventListener('click', (e) => {
    const btn = e.target.closest('.dl-del');
    const p = crib.profile;
    if (!btn || !p) return;
    const d = loadBoard(p.id);
    const entry = d.deposits.find((x) => x.k === btn.dataset.key);
    if (!entry) return;
    if (!confirm(`Erase the ${fmt(entry.c)} entry from ${dateText(entry.t)}?`)) return;
    sync.remove(p.id, entry.k);
    sfx('playClick');
    updateBoard();
    showToast(`🧽 Erased ${fmt(entry.c)} from the board`);
  });

  function switchProfile() {
    if (crib.state !== 'board') return;
    crib.state = 'moving';
    closeBoard();
    sfx('playClick');
    const scene = window.luxury3d;
    const walk = scene && scene.returnToFoyer ? scene.returnToFoyer(onCineEvent) : Promise.resolve();
    walk.then(() => {
      crib.state = 'inside';
      crib.profile = null;
      showProfileSelect();
    });
  }

  $('btn-board-switch').addEventListener('click', switchProfile);
  $('btn-board-leave').addEventListener('click', leaveCrib);
  $('btn-board-community').addEventListener('click', openCommunityFromBoard);

  // ============================================================
  // 6b. COMMUNITY BOARD (everyone's progress + crib total)
  // ============================================================
  const MEDALS = ['🥇', '🥈', '🥉'];

  // gather live numbers for every profile from their saved boards
  function communityStats() {
    const people = PROFILES.map((p) => {
      const d = loadBoard(p.id);
      const saved = savedOf(d);
      const goal = goalOf(p);
      const deposits = d.deposits.filter((x) => Number(x.c) > 0);
      return {
        p, saved, goal, deposits,
        alloc: allocate(saved, p.items),
        frac: Math.min(1, saved / goal),
        biggest: deposits.reduce((m, x) => Math.max(m, x.c), 0),
        last: deposits.reduce((m, x) => Math.max(m, Number(x.t) || 0), 0)
      };
    });
    const total = people.reduce((s, x) => s + x.saved, 0);
    const goal = people.reduce((s, x) => s + x.goal, 0);
    // rank by money put in (ties keep profile order)
    const ranked = people.slice().sort((a, b) => b.saved - a.saved);
    ranked.forEach((x, i) => { x.rank = i + 1; });
    return { people, ranked, total, goal };
  }

  function renderCommunity() {
    const { people, ranked, total, goal } = communityStats();

    cbTotalVal.textContent = fmt(total);
    cbTotalSub.textContent = total >= goal
      ? `Crib goal of ${fmt(goal)} smashed! 🎉`
      : `of ${fmt(goal)} together · ${fmt(goal - total)} to go`;
    cbOverallNum.textContent = fmt(total);
    cbOverallPct.textContent = '0%';
    cbTrackFill.style.width = '0';
    cbPlane.style.left = '5px';
    communityBoard.classList.remove('complete');

    // stacked segments = each person's share of what's been saved
    cbTrackFill.innerHTML = people
      .filter((x) => x.saved > 0)
      .map((x) => `<span class="cb-seg" style="--ink:${x.p.ink};--g:${x.saved}" title="${x.p.name}: ${fmt(x.saved)}"></span>`)
      .join('');
    cbLegend.innerHTML = people
      .map((x) => `<span style="--ink:${x.p.ink}">${x.p.name} <b>${fmt(x.saved)}</b></span>`)
      .join('');

    cbPeople.innerHTML = people.map((x, i) => {
      const share = total > 0 ? Math.round((x.saved / total) * 100) : 0;
      const left = Math.max(0, x.goal - x.saved);
      const mini = x.p.items.map((it, j) => {
        const a = x.alloc[j];
        const w = Math.min(100, (a / it.goal) * 100);
        return `
          <li>
            <span class="cb-mini-name">${ICONS[it.key] || ''} ${it.label}</span>
            <span class="cb-mini-bar"><i style="--mini:${INKS[it.key] || x.p.ink}" data-w="${w.toFixed(2)}"></i></span>
            <span class="cb-mini-amt">${fmt(a)}</span>
          </li>`;
      }).join('');
      return `
        <article class="cb-person${x.saved === 0 ? ' empty' : ''}" id="cb-person-${x.p.id}" style="--ink:${x.p.ink};--i:${i}" data-frac="${x.frac.toFixed(4)}">
          <header class="cb-person-head">
            <span class="cb-avatar">${x.p.initial}</span>
            <div>
              <h3 class="cb-name">${x.p.name}</h3>
              <span class="cb-role">${x.p.role}${sync.isOnline(x.p.id) ? ' · <b class="cb-on">on now</b>' : ''}</span>
            </div>
            <span class="cb-rank" title="Rank #${x.rank}">${x.saved > 0 ? (MEDALS[x.rank - 1] || `#${x.rank}`) : ''}</span>
          </header>
          <div class="cb-ring-row">
            <div class="wb-ring-wrap cb-ring-wrap">
              <svg class="wb-ring" viewBox="0 0 80 80" aria-hidden="true">
                <circle class="ring-track" cx="40" cy="40" r="32"></circle>
                <circle class="ring-fill" cx="40" cy="40" r="32" pathLength="100"></circle>
              </svg>
              <span class="wb-ring-pct">${pctText(x.frac)}</span>
            </div>
            <div class="cb-nums">
              <span class="cb-saved">${fmt(x.saved)}</span>
              <span class="cb-goal">of ${fmt(x.goal)}</span>
              <span class="cb-left">${left > 0 ? `${fmt(left)} to go` : 'Florida ready! 🌴'}</span>
            </div>
          </div>
          <ul class="cb-mini">${mini}</ul>
          <footer class="cb-stats">
            <span><b>${x.deposits.length}</b> deposit${x.deposits.length === 1 ? '' : 's'}</span>
            <span>Biggest <b>${x.biggest ? fmt(x.biggest) : '—'}</b></span>
            <span>Last <b>${x.last ? timeAgo(x.last) : '—'}</b></span>
            <span><b>${share}%</b> of crib total</span>
          </footer>
        </article>`;
    }).join('');

    // leaderboard sticky
    cbLead.innerHTML = ranked.map((x) => `
      <li style="--ink:${x.p.ink}">
        <span class="cb-medal">${MEDALS[x.rank - 1] || x.rank}</span>
        <span class="cb-lead-name">${x.p.name}</span>
        <span class="cb-lead-amt">${fmt(x.saved)}</span>
        <span class="cb-lead-pct">${pctText(x.frac)}</span>
      </li>`).join('');

    // combined activity feed, newest first
    const feed = people
      .flatMap((x) => x.deposits.map((dep) => ({ p: x.p, c: dep.c, t: Number(dep.t) || 0 })))
      .sort((a, b) => b.t - a.t)
      .slice(0, 30);
    cbFeed.innerHTML = feed.length
      ? feed.map((f) => `
          <li style="--ink:${f.p.ink}">
            <span class="cb-feed-who">${f.p.name}</span>
            <span class="dl-amt">+${fmt(f.c)}</span>
            <span class="dl-date">${dateText(f.t)}</span>
          </li>`).join('')
      : '<li class="dl-empty">No money in yet. Who\'s going first?</li>';

    $('cb-surface').scrollTop = 0;
  }

  // "draw" the rings, bars and stacked track once the board is up
  function animateCommunity() {
    const { total, goal } = communityStats();
    const frac = Math.min(1, total / goal);
    cbOverallPct.textContent = pctText(frac);
    cbTrackFill.style.width = `calc((100% - 10px) * ${frac.toFixed(4)})`;
    cbPlane.style.left = `calc(5px + (100% - 10px) * ${frac.toFixed(4)})`;
    communityBoard.classList.toggle('complete', total >= goal);
    cbPeople.querySelectorAll('.cb-person').forEach((el) => {
      const f = Number(el.dataset.frac) || 0;
      el.querySelector('.ring-fill').style.strokeDashoffset = (100 - f * 100).toFixed(2);
    });
    cbPeople.querySelectorAll('.cb-mini-bar i').forEach((bar) => {
      bar.style.width = `${bar.dataset.w}%`;
    });
  }

  // redraw in place when live data arrives (no re-animation, keeps scroll position)
  function refreshCommunityLive() {
    const surface = $('cb-surface');
    const top = surface.scrollTop;
    communityView.classList.add('live-refresh');
    renderCommunity();
    animateCommunity();
    surface.scrollTop = top;
  }

  function openCommunity() {
    if (crib.state !== 'moving') return;
    crib.state = 'community';
    communityView.classList.add('open');
    sfx('playMarker');
    setTimeout(() => { if (crib.state === 'community') animateCommunity(); }, 700);
  }

  // from the foyer: walk over to the wall (locked until at least one profile is unlocked)
  function openCommunityFromProfiles() {
    if (crib.state !== 'inside' || crib.selecting) return;
    if (!crib.unlockedProfiles || crib.unlockedProfiles.size === 0) {
      if (btnCommunity) {
        btnCommunity.classList.remove('shake');
        void btnCommunity.offsetWidth;
        btnCommunity.classList.add('shake');
      }
      sfx('playError');
      showToast('🔒 Community Board is locked. Unlock a profile first!');
      return;
    }
    crib.state = 'moving';
    crib.communityFrom = 'profiles';
    crib.profile = null;
    sfx('playClick');
    hideProfileSelect();
    communityView.classList.remove('live-refresh');
    renderCommunity();
    const scene = window.luxury3d;
    const walk = scene && scene.goToBoard ? scene.goToBoard(onCineEvent) : Promise.resolve();
    const early = setTimeout(openCommunity, 1900);
    walk.then(() => { clearTimeout(early); openCommunity(); });
  }

  // from a personal board: the camera is already at the wall, just swap boards
  function openCommunityFromBoard() {
    if (crib.state !== 'board') return;
    crib.state = 'moving';
    crib.communityFrom = 'board';
    sfx('playClick');
    closeBoard();
    communityView.classList.remove('live-refresh');
    renderCommunity();
    setTimeout(openCommunity, 380);
  }

  function closeCommunity() {
    if (crib.state !== 'community') return;
    crib.state = 'moving';
    communityView.classList.remove('open');
    sfx('playClick');

    if (crib.communityFrom === 'board' && crib.profile) {
      setTimeout(openBoard, 380);
      return;
    }
    const scene = window.luxury3d;
    const walk = scene && scene.returnToFoyer ? scene.returnToFoyer(onCineEvent) : Promise.resolve();
    walk.then(() => {
      crib.state = 'inside';
      crib.profile = null;
      showProfileSelect();
    });
  }

  $('btn-community').addEventListener('click', openCommunityFromProfiles);
  $('btn-community-back').addEventListener('click', closeCommunity);
  $('btn-community-leave').addEventListener('click', leaveCrib);

  // ============================================================
  // 6c. THE LEDGER — Marcus, the AI bartender
  // ============================================================
  // live snapshot of the guest's Florida board so Marcus can weigh every purchase against it
  function marcusContext() {
    const p = crib.profile;
    if (!p) return { id: 'guest' };
    const d = loadBoard(p.id);
    const saved = savedOf(d);
    const alloc = allocate(saved, p.items);
    const deps = d.deposits.filter((x) => Number(x.c) > 0).slice().sort((a, b) => (a.t || 0) - (b.t || 0));
    const first = deps.length ? Number(deps[0].t) || Date.now() : 0;
    const days = first ? Math.max(7, (Date.now() - first) / 86400000) : 0;
    return {
      id: p.id,
      name: p.name,
      role: p.role,
      goalCents: goalOf(p),
      savedCents: saved,
      items: p.items.map((it, i) => ({ label: it.label, goal: it.goal, saved: alloc[i] })),
      deposits: deps.slice(-8).map((x) => ({ c: Number(x.c), t: Number(x.t) || Date.now() })),
      depositCount: deps.length,
      perDayCents: days ? saved / days : 0
    };
  }

  function openBar() {
    if (crib.state !== 'inside' && crib.state !== 'board') return;
    crib.barFrom = crib.state;
    crib.state = 'toBar';
    sfx('playClick');
    if (crib.barFrom === 'board') {
      closeBoard();
    } else {
      hideProfileSelect();
    }
    cineCaptionKicker.textContent = 'NOW SEATED';
    const scene = window.luxury3d;
    const walk = scene && scene.goToBar ? scene.goToBar((name) => { if (name === 'barLights') sfx('playWhoosh', 2.6); }) : Promise.resolve();
    walk.then(() => {
      if (crib.state !== 'toBar') return;
      crib.state = 'bar';
      if (window.marcus) window.marcus.open(marcusContext());
    });
  }

  function closeBar() {
    if (crib.state !== 'bar') return;
    crib.state = 'fromBar';
    if (window.marcus) window.marcus.close();
    sfx('playHover');
    const scene = window.luxury3d;
    const walk = scene && scene.leaveBar ? scene.leaveBar() : Promise.resolve();
    walk.then(() => {
      if (crib.barFrom === 'board' && crib.profile) {
        crib.state = 'moving';
        openBoard();
      } else {
        crib.state = 'inside';
        crib.profile = null;
        showProfileSelect();
      }
    });
  }

  $('btn-bar').addEventListener('click', openBar);
  $('btn-board-bar').addEventListener('click', openBar);
  window.addEventListener('marcus:back', closeBar);

  // ============================================================
  // 7. ENTRANCE / EXIT CINEMATICS
  // ============================================================
  function onCineEvent(name) {
    if (name === 'depart') sfx('playWhoosh', 3.2);
    if (name === 'doors') sfx('playDoorOpen');
    if (name === 'doorsClose') sfx('playDoorClose');
    if (name === 'threshold') {
      thresholdGlow.classList.remove('flash');
      void thresholdGlow.offsetWidth; // restart the animation
      thresholdGlow.classList.add('flash');
      sfx('playWelcome');
    }
  }

  function enterCrib() {
    if (crib.state !== 'menu') return;
    crib.state = 'entering';
    cineCaptionKicker.textContent = 'NOW ARRIVING';
    document.body.classList.add('cine-active');

    const scene = window.luxury3d;
    const run = scene && scene.playEntrance ? scene.playEntrance(onCineEvent) : Promise.resolve();
    run.then(() => {
      crib.state = 'inside';
      document.body.classList.remove('cine-active');
      document.body.classList.add('in-crib');
      showProfileSelect();
      // ?bar in the URL jumps straight to Marcus (handy for testing)
      if (DEBUG_BAR) setTimeout(openBar, 200);
    });
  }

  const DEBUG_BAR = new URLSearchParams(location.search).has('bar');
  if (DEBUG_BAR) {
    setTimeout(() => {
      enterCrib();
      skipCinematic();
    }, 600);
  }

  function leaveCrib() {
    if (!['inside', 'locking', 'board', 'community'].includes(crib.state)) return;
    crib.state = 'leaving';
    crib.profile = null;
    hideProfileSelect();
    closeBoard();
    communityView.classList.remove('open');
    document.querySelectorAll('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
    cineCaptionKicker.textContent = 'NOW DEPARTING';
    document.body.classList.remove('in-crib');
    document.body.classList.add('cine-active');
    sfx('playClick');

    const scene = window.luxury3d;
    const run = scene && scene.playExit ? scene.playExit(onCineEvent) : Promise.resolve();
    run.then(() => {
      crib.state = 'menu';
      document.body.classList.remove('cine-active');
    });
  }

  function skipCinematic() {
    if (window.luxury3d && window.luxury3d.skipCinematic) window.luxury3d.skipCinematic();
  }

  btnSkipCine.addEventListener('click', skipCinematic);
  btnLeaveCrib.addEventListener('click', leaveCrib);

  // ============================================================
  // 8. SETTINGS CONTROLLER
  // ============================================================
  const sliderMusic = $('slider-music');
  const sliderSfx = $('slider-sfx');
  const valMusic = $('val-music');
  const valSfx = $('val-sfx');
  const toggleParallax = $('toggle-parallax');
  const toggleWater = $('toggle-water');
  const btnResetData = $('btn-reset-data');

  sliderMusic.addEventListener('input', (e) => {
    const val = e.target.value;
    valMusic.textContent = `${val}%`;
    if (window.gameAudio) window.gameAudio.setMusicVolume(val);
  });

  sliderSfx.addEventListener('input', (e) => {
    const val = e.target.value;
    valSfx.textContent = `${val}%`;
    if (window.gameAudio) window.gameAudio.setSfxVolume(val);
  });

  toggleParallax.addEventListener('change', (e) => {
    if (window.luxury3d) {
      window.luxury3d.parallaxEnabled = e.target.checked;
    }
  });

  toggleWater.addEventListener('change', (e) => {
    if (window.luxury3d && window.luxury3d.waterMesh) {
      window.luxury3d.waterMesh.visible = e.target.checked;
    }
  });

  btnResetData.addEventListener('click', () => {
    if (sync.cloud) {
      // live mode: this wipes the shared boards on every phone, so make it deliberate
      const typed = prompt('This erases EVERYONE\'s money log on every phone.\nType RESET to confirm.');
      if ((typed || '').trim().toUpperCase() !== 'RESET') return;
      sync.resetAll()
        .then(() => showToast('⚠️ All Florida boards reset for everyone.'))
        .catch(() => showToast('❌ Reset failed. Check your connection.'));
      return;
    }
    if (confirm('Erase every Florida board money log saved on this device?')) {
      localStorage.clear();
      showToast('⚠️ All Florida boards reset.');
      setTimeout(() => location.reload(), 1200);
    }
  });

  // ============================================================
  // 9. TOAST NOTIFICATION HELPER
  // ============================================================
  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  }
});
