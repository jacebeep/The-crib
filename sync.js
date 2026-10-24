/**
 * THA CRIB — LIVE SYNC
 * Shares every board between phones in real time using Firebase Realtime Database.
 * If firebase-config.js is empty (or the phone is offline on first load) it falls back
 * to saving on this device only, exactly like before.
 *
 * Data layout in the database:
 *   boards/{profileId}/deposits/{pushId} = { c: cents, t: timestamp }
 *   presence/{profileId}/{deviceId}      = timestamp   (removed automatically on disconnect)
 *   visits/{profileId}                   = timestamp of last unlock
 */
(function () {
  const LS_BOARD = (id) => `the_crib_board_${id}`;
  const LS_VISIT = (id) => `the_crib_last_visit_${id}`;
  const LS_MIGRATED = (id) => `the_crib_migrated_${id}`;

  function readLocal(id) {
    try {
      const d = JSON.parse(localStorage.getItem(LS_BOARD(id)));
      if (d && Array.isArray(d.deposits)) {
        return d.deposits
          .map((x, i) => ({ k: x.k || `local-${Number(x.t) || 0}-${i}`, c: Number(x.c) || 0, t: Number(x.t) || 0 }))
          .filter((x) => x.c > 0);
      }
    } catch (err) { /* corrupted entry: start fresh */ }
    return [];
  }

  const writeLocal = (id, list) => {
    try { localStorage.setItem(LS_BOARD(id), JSON.stringify({ deposits: list })); } catch (err) { /* storage full */ }
  };

  window.createCribSync = function createCribSync(opts) {
    const ids = opts.profiles;
    const emit = (fn, ...args) => {
      if (typeof fn !== 'function') return;
      try { fn(...args); } catch (err) { console.error('[sync]', err); }
    };

    const deposits = {};
    const visits = {};
    let online = {};
    ids.forEach((id) => {
      deposits[id] = readLocal(id);
      visits[id] = Number(localStorage.getItem(LS_VISIT(id))) || 0;
    });

    // --- try to connect to Firebase ---
    const cfg = window.CRIB_FIREBASE_CONFIG;
    let db = null;
    if (cfg && cfg.databaseURL && window.firebase && firebase.database) {
      try {
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        db = firebase.database();
      } catch (err) {
        console.warn('[sync] Firebase failed to start, using this device only.', err);
        db = null;
      }
    }

    const api = {
      cloud: !!db,
      get: (id) => deposits[id] || [],
      lastVisit: (id) => visits[id] || 0,
      isOnline: (id) => !!online[id]
    };

    // ============================================================
    // LOCAL-ONLY MODE
    // ============================================================
    if (!db) {
      api.add = (id, cents) => {
        const entry = { k: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, c: cents, t: Date.now() };
        deposits[id] = deposits[id].concat(entry);
        writeLocal(id, deposits[id]);
        emit(opts.onChange, id);
        return entry.k;
      };
      api.remove = (id, key) => {
        deposits[id] = deposits[id].filter((x) => x.k !== key);
        writeLocal(id, deposits[id]);
        emit(opts.onChange, id);
      };
      api.resetAll = () => {
        ids.forEach((id) => { deposits[id] = []; localStorage.removeItem(LS_BOARD(id)); });
        return Promise.resolve();
      };
      api.markVisit = (id) => {
        visits[id] = Date.now();
        localStorage.setItem(LS_VISIT(id), String(visits[id]));
      };
      api.setPresence = () => {};

      // other tabs on the same device stay in step
      window.addEventListener('storage', (e) => {
        const id = ids.find((x) => e.key === LS_BOARD(x));
        if (!id) return;
        deposits[id] = readLocal(id);
        emit(opts.onChange, id);
      });

      setTimeout(() => emit(opts.onStatus, 'local'), 0);
      return api;
    }

    // ============================================================
    // LIVE (FIREBASE) MODE
    // ============================================================
    const TS = firebase.database.ServerValue.TIMESTAMP;
    const deviceId = Math.random().toString(36).slice(2, 10);
    const mine = new Set();   // pushes made from this device (no "X just put in" toast for these)
    const loaded = {};
    let presenceRef = null;
    let presenceFor = null;

    function registerPresence() {
      if (!presenceFor) return;
      presenceRef = db.ref(`presence/${presenceFor}/${deviceId}`);
      presenceRef.onDisconnect().remove();
      presenceRef.set(TS);
    }

    db.ref('.info/connected').on('value', (snap) => {
      const up = snap.val() === true;
      emit(opts.onStatus, up ? 'live' : 'connecting');
      if (up) registerPresence(); // re-announce after a dropped connection
    });

    ids.forEach((id) => {
      const ref = db.ref(`boards/${id}/deposits`);
      ref.on('value', (snap) => {
        const list = [];
        snap.forEach((child) => {
          const v = child.val() || {};
          const c = Number(v.c) || 0;
          if (c > 0) list.push({ k: child.key, c, t: Number(v.t) || 0 });
        });
        list.sort((a, b) => a.t - b.t);

        // one-time upload of money that was saved on this phone before live sync was turned on
        if (!loaded[id] && !localStorage.getItem(LS_MIGRATED(id))) {
          localStorage.setItem(LS_MIGRATED(id), '1');
          const legacy = deposits[id].filter((x) => x.k.startsWith('local-'));
          if (legacy.length && list.length === 0) {
            loaded[id] = true;
            legacy.forEach((x) => mine.add(ref.push({ c: x.c, t: x.t || Date.now() }).key));
            return; // the pushes trigger another 'value' event with everything in it
          }
        }

        const known = new Set(deposits[id].map((x) => x.k));
        const fresh = loaded[id] ? list.filter((x) => !known.has(x.k) && !mine.has(x.k)) : [];
        deposits[id] = list;
        writeLocal(id, list);
        loaded[id] = true;
        emit(opts.onChange, id);
        fresh.forEach((x) => emit(opts.onRemoteDeposit, id, x));
      }, (err) => {
        console.warn('[sync] Could not read boards. Check the database rules.', err);
        emit(opts.onStatus, 'error');
      });
    });

    db.ref('presence').on('value', (snap) => {
      const v = snap.val() || {};
      online = {};
      ids.forEach((id) => { online[id] = !!(v[id] && Object.keys(v[id]).length); });
      emit(opts.onPresence);
    });

    db.ref('visits').on('value', (snap) => {
      const v = snap.val() || {};
      ids.forEach((id) => {
        const t = Number(v[id]) || 0;
        if (t > (visits[id] || 0)) visits[id] = t;
      });
      emit(opts.onPresence);
    });

    api.add = (id, cents) => {
      const r = db.ref(`boards/${id}/deposits`).push();
      mine.add(r.key);
      r.set({ c: cents, t: TS }).catch((err) => {
        console.warn('[sync] Deposit was rejected', err);
        emit(opts.onStatus, 'error');
      });
      return r.key;
    };

    api.remove = (id, key) => {
      db.ref(`boards/${id}/deposits/${key}`).remove().catch((err) => console.warn('[sync] Erase failed', err));
    };

    api.resetAll = () => {
      ids.forEach((id) => localStorage.removeItem(LS_BOARD(id)));
      return db.ref('boards').remove();
    };

    api.markVisit = (id) => {
      visits[id] = Date.now();
      localStorage.setItem(LS_VISIT(id), String(visits[id]));
      db.ref(`visits/${id}`).set(TS);
    };

    // who is looking at their board right now
    api.setPresence = (id) => {
      if (presenceRef) {
        presenceRef.onDisconnect().cancel();
        presenceRef.remove();
        presenceRef = null;
      }
      presenceFor = id || null;
      registerPresence();
    };

    return api;
  };
})();
