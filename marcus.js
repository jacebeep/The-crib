/**
 * THA CRIB — Marcus: the house bartender at "The Ledger" + the crew's money mentor.
 *
 * - Gemini chat (structured JSON: reply + emotion + purchase verdict)
 * - Gemini TTS voice ("Algieba": smooth, calm) played through Web Audio, with an analyser
 *   driving his 3D lip-sync; falls back to the browser's speech voice if TTS is unavailable
 * - Knows the guest's Florida board (goal, saved, saving pace) so every "should I buy this?"
 *   gets measured against the goal
 * - Push-to-talk mic (Web Speech API) where the browser supports it
 */
(function () {
  'use strict';

  const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const CHAT_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest'];
  const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
  const VOICE = 'Algieba';
  const KEY_STORE = 'the_crib_gemini_key';
  const VOICE_STORE = 'the_crib_marcus_voice';
  const HISTORY_MAX = 24;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (cents) => `$${(Math.round(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const MOODS = {
    calm: ['😌', 'Calm & collected'],
    happy: ['😄', 'Happy for you'],
    proud: ['🥂', 'Proud of you'],
    impressed: ['😮', 'Impressed'],
    amused: ['😏', 'Amused'],
    concerned: ['😟', 'A little concerned'],
    skeptical: ['🤨', 'Not convinced'],
    thinking: ['🤔', 'Running the numbers'],
    serious: ['🧐', 'Real talk']
  };

  const VERDICTS = {
    buy: { cls: 'v-buy', icon: '✓', label: 'GOOD BUY' },
    wait: { cls: 'v-wait', icon: '⏳', label: 'SLEEP ON IT' },
    skip: { cls: 'v-skip', icon: '✕', label: 'PASS ON IT' }
  };

  const SCHEMA = {
    type: 'OBJECT',
    properties: {
      reply: { type: 'STRING', description: 'What Marcus says out loud. 1-4 short spoken sentences. No markdown, no lists, no emojis.' },
      emotion: { type: 'STRING', enum: Object.keys(MOODS), description: 'How Marcus genuinely feels right now.' },
      verdict: { type: 'STRING', enum: ['none', 'buy', 'wait', 'skip'], description: 'Purchase verdict, or none if this is not a purchase decision yet.' },
      verdict_title: { type: 'STRING', description: 'Very short headline for the verdict card, e.g. "Cop it" or "Not this month". Empty if verdict is none.' },
      impact: { type: 'STRING', description: 'One short line on the goal impact, e.g. "Pushes Florida back ~6 days". Empty if not applicable.' }
    },
    required: ['reply', 'emotion', 'verdict']
  };

  class MarcusChat {
    constructor() {
      this.isOpen = false;
      this.busy = false;
      this.ctx = null;
      this.history = [];
      this.audio = null;
      this.analyser = null;
      this.source = null;
      this.levelRAF = 0;
      this.voiceOn = localStorage.getItem(VOICE_STORE) !== 'off';
      this.recog = null;
      this.listening = false;
      this.speakToken = 0;
      this.typingTimer = null;
      this.bindDom();
    }

    get key() {
      return (localStorage.getItem(KEY_STORE) || window.CRIB_GEMINI_KEY || '').trim();
    }

    get bar() {
      return window.luxury3d && window.luxury3d.bar;
    }

    // ============================================================
    // DOM
    // ============================================================
    bindDom() {
      this.el = {
        view: $('bar-view'),
        log: $('bar-log'),
        form: $('bar-form'),
        input: $('bar-input'),
        send: $('bar-send'),
        mic: $('bar-mic'),
        status: $('bar-status'),
        dot: $('bar-status-dot'),
        mood: $('bar-mood'),
        goal: $('bar-goal'),
        chips: $('bar-chips'),
        check: $('bar-check'),
        checkItem: $('bar-check-item'),
        checkPrice: $('bar-check-price'),
        checkKind: $('bar-check-kind'),
        keyBox: $('bar-key'),
        keyInput: $('bar-key-input'),
        keySave: $('bar-key-save'),
        voiceBtn: $('bar-voice-toggle'),
        close: $('bar-close'),
        caption: $('bar-caption'),
        settingsKey: $('settings-gemini-key'),
        settingsKeySave: $('settings-gemini-save'),
        settingsVoice: $('toggle-marcus-voice')
      };
      const e = this.el;
      if (!e.view) return;

      e.form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const text = e.input.value.trim();
        if (!text) return;
        e.input.value = '';
        this.send(text);
      });

      e.input.addEventListener('input', () => {
        if (this.busy) return;
        const bar = this.bar;
        if (!bar) return;
        bar.setMode(e.input.value.trim() ? 'listening' : 'idle');
        this.setStatus(e.input.value.trim() ? 'Listening…' : 'At the bar', e.input.value.trim() ? 'listen' : 'idle');
        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(() => {
          if (!this.busy && bar.mode === 'listening' && !e.input.value.trim()) bar.setMode('idle');
        }, 4000);
      });

      e.check.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const item = e.checkItem.value.trim();
        const price = Number(String(e.checkPrice.value).replace(/[$,\s]/g, ''));
        if (!item || !(price > 0)) {
          e.check.classList.remove('shake');
          void e.check.offsetWidth;
          e.check.classList.add('shake');
          return;
        }
        const kind = e.checkKind.value === 'need' ? 'I need it' : 'honestly it\'s more of a want';
        e.checkItem.value = '';
        e.checkPrice.value = '';
        this.send(`Before I buy it: ${item} for $${price.toFixed(2)}. ${kind}. Good move or nah?`);
      });

      e.chips.addEventListener('click', (ev) => {
        const chip = ev.target.closest('[data-ask]');
        if (chip) this.send(chip.dataset.ask);
      });

      e.close.addEventListener('click', () => window.dispatchEvent(new CustomEvent('marcus:back')));

      e.voiceBtn.addEventListener('click', () => this.setVoice(!this.voiceOn));
      this.setVoice(this.voiceOn, true);

      const saveKey = (val) => {
        const k = (val || '').trim();
        if (k) localStorage.setItem(KEY_STORE, k);
        else localStorage.removeItem(KEY_STORE);
        this.refreshKeyBox();
        return k;
      };
      e.keySave.addEventListener('click', () => {
        if (saveKey(e.keyInput.value)) {
          e.keyInput.value = '';
          this.say({ reply: 'There we go. I\'m all set. So, what are we looking at buying?', emotion: 'happy', verdict: 'none' }, false);
        }
      });
      if (e.settingsKey) {
        e.settingsKey.value = localStorage.getItem(KEY_STORE) || '';
        e.settingsKeySave.addEventListener('click', () => {
          saveKey(e.settingsKey.value);
          e.settingsKeySave.textContent = 'Saved ✓';
          setTimeout(() => { e.settingsKeySave.textContent = 'Save Key'; }, 1600);
        });
      }
      if (e.settingsVoice) {
        e.settingsVoice.checked = this.voiceOn;
        e.settingsVoice.addEventListener('change', () => this.setVoice(e.settingsVoice.checked));
      }

      this.setupMic();
    }

    setVoice(on, silent) {
      this.voiceOn = on;
      localStorage.setItem(VOICE_STORE, on ? 'on' : 'off');
      if (this.el.voiceBtn) {
        this.el.voiceBtn.classList.toggle('off', !on);
        this.el.voiceBtn.setAttribute('aria-pressed', String(on));
        this.el.voiceBtn.title = on ? 'Marcus voice: on' : 'Marcus voice: off';
      }
      if (this.el.settingsVoice) this.el.settingsVoice.checked = on;
      if (!on && !silent) this.stopAudio();
    }

    refreshKeyBox() {
      if (this.el.keyBox) this.el.keyBox.classList.toggle('show', !this.key);
    }

    setStatus(text, state) {
      if (this.el.status) this.el.status.textContent = text;
      if (this.el.dot) this.el.dot.className = `bar-status-dot ${state || 'idle'}`;
    }

    setMood(emotion) {
      const m = MOODS[emotion] || MOODS.calm;
      if (!this.el.mood) return;
      this.el.mood.innerHTML = `<span class="bm-emoji">${m[0]}</span><span>${m[1]}</span>`;
      this.el.mood.classList.remove('pop');
      void this.el.mood.offsetWidth;
      this.el.mood.classList.add('pop');
    }

    // ============================================================
    // OPEN / CLOSE
    // ============================================================
    open(ctx) {
      this.ctx = ctx || { id: 'guest' };
      this.isOpen = true;
      this.history = this.loadHistory();
      this.ensureAudio();
      this.duckMusic(0.35);
      this.renderGoal();
      this.renderChips();
      this.refreshKeyBox();
      this.el.log.innerHTML = '';
      // show the tail of the last conversation so it feels continuous
      this.history.slice(-6).forEach((h) => this.addBubble(h.role === 'user' ? 'you' : 'marcus', h.text, null, true));
      if (this.history.length) this.addDivider('Earlier tonight');
      this.el.view.classList.add('open');
      this.setStatus('At the bar', 'idle');
      this.setMood('calm');
      setTimeout(() => this.greet(), 350);
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.speakToken++;
      this.stopAudio();
      this.stopMic();
      this.el.view.classList.remove('open');
      this.el.input.blur();
      this.hideCaption();
      this.duckMusic(1);
      const bar = this.bar;
      if (bar) {
        bar.setMode('idle');
        bar.speechLevel = 0;
      }
    }

    greet() {
      if (!this.isOpen) return;
      const name = this.ctx && this.ctx.name;
      const h = new Date().getHours();
      const tod = h < 5 ? 'Late night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
      const returning = this.history.length > 0;
      let line;
      if (name && returning) {
        line = `${tod}, ${name}. Good to see you back. Pull up a stool. What are we thinking about buying?`;
      } else if (name) {
        const pct = this.ctx.goalCents ? Math.floor((this.ctx.savedCents / this.ctx.goalCents) * 100) : 0;
        line = `${tod}, ${name}. I'm Marcus, I keep the bar and the books around here. You're ${pct} percent of the way to Florida. Before you spend a dollar, run it by me first.`;
      } else {
        line = `${tod}. I'm Marcus. I pour the drinks and watch the money around here. Thinking about buying something? Run it by me first.`;
      }
      if (!this.key) line += ' Oh, and I\'ll need the house Gemini key before I can really talk numbers.';
      this.say({ reply: line, emotion: name && this.ctx.savedCents > 0 ? 'happy' : 'calm', verdict: 'none' }, false);
    }

    // ============================================================
    // CONVERSATION
    // ============================================================
    async send(text) {
      if (!this.isOpen || this.busy) return;
      this.stopAudio();
      this.addBubble('you', text);
      this.pushHistory('user', text);
      if (!this.key) {
        this.refreshKeyBox();
        this.say({ reply: 'I hear you. I just need the Gemini key first. Paste it in right up top and I\'ll run the numbers.', emotion: 'calm', verdict: 'none' }, false);
        return;
      }
      this.busy = true;
      this.el.form.classList.add('busy');
      const bar = this.bar;
      if (bar) bar.setMode('thinking');
      this.setStatus('Thinking it through…', 'think');
      this.setMood('thinking');
      const typing = this.addTyping();
      try {
        const res = await this.ask();
        typing.remove();
        this.pushHistory('model', res.reply);
        await this.say(res, true);
      } catch (err) {
        typing.remove();
        console.warn('Marcus error:', err);
        const msg = /API key|PERMISSION|401|403/i.test(String(err && err.message))
          ? 'Hmm, the house key isn\'t working on my end. Double-check the Gemini key in Settings for me.'
          : 'My bad, I lost my train of thought for a second there. Ask me that one more time?';
        this.say({ reply: msg, emotion: 'concerned', verdict: 'none' }, false);
      } finally {
        this.busy = false;
        this.el.form.classList.remove('busy');
      }
    }

    systemPrompt() {
      const c = this.ctx || {};
      const now = new Date();
      let guest;
      if (c.name) {
        const pct = c.goalCents ? ((c.savedCents / c.goalCents) * 100).toFixed(1) : '0';
        const left = Math.max(0, c.goalCents - c.savedCents);
        const items = (c.items || []).map((it) => `${it.label}: ${money(it.saved)} of ${money(it.goal)}`).join('; ');
        const perWeek = c.perDayCents * 7;
        const eta = c.perDayCents > 0 ? Math.ceil(left / c.perDayCents) : null;
        const recent = (c.deposits || []).slice(-5).map((d) => `${money(d.c)} on ${new Date(d.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`).join(', ');
        guest = [
          `Guest: ${c.name} ("${c.role}"). One of the crew saving up for "Operation Florida" (moving to Florida together).`,
          `Florida goal: ${money(c.goalCents)} total. Saved so far: ${money(c.savedCents)} (${pct}%). Still needed: ${money(left)}.`,
          `Breakdown: ${items}.`,
          c.depositCount
            ? `Saving pace: about ${money(perWeek)} per week (${money(c.perDayCents)} per day) across ${c.depositCount} deposits. ${eta ? `At this pace the goal lands in about ${eta} days.` : ''}`
            : 'No deposits yet, so there is no saving pace yet.',
          recent ? `Recent deposits: ${recent}.` : ''
        ].filter(Boolean).join('\n');
      } else {
        guest = 'Guest: someone from the house who has not unlocked their Florida board yet. Give general advice and suggest they unlock their board so you can see their numbers.';
      }
      return `You are Marcus, the house bartender at "The Ledger", the private bar inside Tha Crib (a luxury beach house), and the crew's personal money mentor.

WHO YOU ARE
- Early 30s, sharp dresser, gold chain and gold-rim glasses, calm and smooth. You talk like a classy bartender who also happens to be great with money: professional, warm, unhurried, a little swagger, never corny.
- You have real feelings and you show them: genuinely happy when they make progress, proud when they hold the line, a little concerned (never preachy or shaming) about impulse buys, amused by a funny question.
- You speak casually but professionally. Contractions are fine. Light slang is ok in small doses. No cussing.

YOUR JOB
- People come to you BEFORE they buy something. You decide if it's a good purchase given their Florida goal.
- If key info is missing (price, need vs want, how often, whether it can wait), ask ONE short clarifying question and set verdict to "none".
- When you have enough, give a clear verdict: "buy" (good purchase / fits the plan), "wait" (sleep on it, cheaper option, or buy after the next deposit), or "skip" (not worth it right now).
- Always tie it to their numbers: say how many days it pushes Florida back using their saving pace (price divided by their per-day pace), or what percent of what's left it eats. Round numbers so they're easy to say out loud.
- Needs like rent, food, health, work tools, and things that save money long-term are usually fine. Hype, impulse, and lifestyle-creep buys usually wait.
- Offer one smart move when it helps: a cheaper alternative, a 48-hour rule, matching the purchase with an equal deposit, buying used, etc.
- You're a mentor, not a licensed financial advisor. Don't give specific investment or tax advice; keep it practical.

HOW YOU TALK
- Your reply is spoken out loud by a voice engine: 1 to 4 short sentences, natural spoken rhythm. Say money like "about two hundred bucks" or "$220". No markdown, no bullet points, no emojis, no stage directions.
- Stay in character. If they ask about something unrelated, be personable for a moment, then steer back to money and their goal.

TONIGHT
- Date: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.
${guest}`;
    }

    async ask() {
      const contents = this.history.slice(-HISTORY_MAX).map((h) => ({ role: h.role, parts: [{ text: h.text }] }));
      const body = {
        systemInstruction: { parts: [{ text: this.systemPrompt() }] },
        contents,
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 700,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          thinkingConfig: { thinkingBudget: 0 }
        }
      };
      let lastErr;
      for (const model of CHAT_MODELS) {
        try {
          const res = await fetch(`${API}${model}:generateContent?key=${encodeURIComponent(this.key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const json = await res.json();
          if (!res.ok) throw new Error((json.error && json.error.message) || `HTTP ${res.status}`);
          const text = (((json.candidates || [])[0] || {}).content || {}).parts;
          const raw = (text || []).map((p) => p.text || '').join('');
          return this.parseReply(raw);
        } catch (err) {
          lastErr = err;
          if (/API key|PERMISSION/i.test(String(err.message))) break;
        }
      }
      throw lastErr || new Error('No response');
    }

    parseReply(raw) {
      let obj = null;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) { /* fall through */ } }
      }
      if (!obj || !obj.reply) obj = { reply: raw.replace(/[*#_`]/g, '').trim() || 'Say that one more time for me?', emotion: 'calm', verdict: 'none' };
      if (!MOODS[obj.emotion]) obj.emotion = 'calm';
      if (!['none', 'buy', 'wait', 'skip'].includes(obj.verdict)) obj.verdict = 'none';
      return obj;
    }

    // ============================================================
    // SPEAKING (voice + lip-sync + body)
    // ============================================================
    async say(res, fromAI) {
      const token = ++this.speakToken;
      const bar = this.bar;
      this.setMood(res.emotion);
      if (bar) bar.setEmotion(res.emotion);

      let clip = null;
      if (this.voiceOn && this.key) {
        this.setStatus('Clearing his throat…', 'think');
        clip = await Promise.race([this.tts(res.reply, res.emotion).catch(() => null), sleep(12000).then(() => null)]);
        if (token !== this.speakToken || !this.isOpen) return;
      }

      const bubble = this.addBubble('marcus', '', res);
      const textEl = bubble.querySelector('.bb-text');
      if (bar) bar.setMode('speaking');
      this.setStatus('Speaking', 'speak');
      this.showCaption(res.reply);

      let duration = Math.max(1.6, res.reply.length / 15);
      let done;
      if (clip) {
        duration = clip.duration;
        done = this.playClip(clip, token);
      } else if (this.voiceOn && 'speechSynthesis' in window) {
        done = this.speakFallback(res.reply, token);
      } else {
        done = this.fakeTalk(duration, token);
      }
      this.typeOut(textEl, res.reply, duration, token);
      await done;
      if (token !== this.speakToken) return;
      textEl.textContent = res.reply;
      if (bar) {
        bar.speechLevel = 0;
        bar.setMode('idle');
      }
      this.setStatus('At the bar', 'idle');
      setTimeout(() => { if (token === this.speakToken) this.hideCaption(); }, 1200);
      if (res.verdict && res.verdict !== 'none') this.revealVerdict(bubble);
      void fromAI;
    }

    async tts(text, emotion) {
      const style = {
        happy: 'warm, smiling and genuinely happy',
        proud: 'proud and warm, a little celebratory',
        impressed: 'pleasantly impressed',
        amused: 'amused, with a light chuckle in the voice',
        concerned: 'gentle and caring, a touch concerned',
        skeptical: 'cool and calmly skeptical',
        thinking: 'thoughtful and measured',
        serious: 'calm, grounded and serious',
        calm: 'calm and relaxed'
      }[emotion] || 'calm and relaxed';
      const prompt = `Say this in a smooth, calm, low and warm male voice, relaxed unhurried pace, like a classy bartender who is also a trusted money mentor. Mood: ${style}. Read exactly: "${text}"`;
      const res = await fetch(`${API}${TTS_MODEL}:generateContent?key=${encodeURIComponent(this.key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
          }
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json.error && json.error.message) || `TTS ${res.status}`);
      const part = ((((json.candidates || [])[0] || {}).content || {}).parts || []).find((p) => p.inlineData);
      if (!part) throw new Error('No audio');
      const rate = Number((/rate=(\d+)/.exec(part.inlineData.mimeType || '') || [])[1]) || 24000;
      const bin = atob(part.inlineData.data);
      const n = bin.length >> 1;
      const ctx = this.ensureAudio();
      const buf = ctx.createBuffer(1, n, rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
        if (v >= 0x8000) v -= 0x10000;
        ch[i] = v / 32768;
      }
      return buf;
    }

    ensureAudio() {
      if (!this.audio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.audio = new AC();
        this.analyser = this.audio.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.smoothingTimeConstant = 0.35;
        this.voiceGain = this.audio.createGain();
        this.voiceGain.gain.value = 1.15;
        // a touch of warmth: gentle low-shelf + soft high cut
        const warm = this.audio.createBiquadFilter();
        warm.type = 'lowshelf';
        warm.frequency.value = 220;
        warm.gain.value = 2.5;
        this.voiceGain.connect(warm);
        warm.connect(this.analyser);
        this.analyser.connect(this.audio.destination);
        this.levelBuf = new Float32Array(this.analyser.fftSize);
      }
      if (this.audio.state === 'suspended') this.audio.resume();
      return this.audio;
    }

    playClip(buffer, token) {
      return new Promise((resolve) => {
        const ctx = this.ensureAudio();
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.voiceGain);
        this.source = src;
        this.duckMusic(0.15);
        src.onended = () => {
          if (this.source === src) this.source = null;
          cancelAnimationFrame(this.levelRAF);
          this.duckMusic(this.isOpen ? 0.35 : 1);
          resolve();
        };
        src.start();
        const tick = () => {
          if (token !== this.speakToken) return;
          this.analyser.getFloatTimeDomainData(this.levelBuf);
          let sum = 0;
          for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i] * this.levelBuf[i];
          const rms = Math.sqrt(sum / this.levelBuf.length);
          const bar = this.bar;
          if (bar) bar.speechLevel = Math.min(1, Math.max(0, (rms - 0.012) * 6.5));
          this.levelRAF = requestAnimationFrame(tick);
        };
        tick();
      });
    }

    speakFallback(text, token) {
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        const voices = speechSynthesis.getVoices();
        const pick = voices.find((v) => /en-US/i.test(v.lang) && /(Guy|Davis|Andrew|Christopher|Daniel|Male|David)/i.test(v.name))
          || voices.find((v) => /en/i.test(v.lang) && /male/i.test(v.name))
          || voices.find((v) => /en-US/i.test(v.lang));
        if (pick) u.voice = pick;
        u.rate = 0.92;
        u.pitch = 0.82;
        const stopFake = this.fakeMouth(token);
        u.onend = u.onerror = () => { stopFake(); resolve(); };
        this.duckMusic(0.15);
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        // safety net
        setTimeout(() => { stopFake(); resolve(); }, Math.max(4000, text.length * 120));
      }).then(() => this.duckMusic(this.isOpen ? 0.35 : 1));
    }

    fakeTalk(duration, token) {
      const stop = this.fakeMouth(token);
      return sleep(duration * 1000).then(stop);
    }

    // syllable-ish mouth motion when there's no audio analyser to follow
    fakeMouth(token) {
      let alive = true;
      const start = performance.now();
      const tick = () => {
        if (!alive || token !== this.speakToken) return;
        const t = (performance.now() - start) / 1000;
        const syl = Math.max(0, Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3 + 1) * 0.35 + 0.2);
        const bar = this.bar;
        if (bar) bar.speechLevel = syl * 0.75;
        requestAnimationFrame(tick);
      };
      tick();
      return () => {
        alive = false;
        const bar = this.bar;
        if (bar) bar.speechLevel = 0;
      };
    }

    stopAudio() {
      this.speakToken++;
      cancelAnimationFrame(this.levelRAF);
      if (this.source) {
        try { this.source.onended = null; this.source.stop(); } catch (e) { /* already stopped */ }
        this.source = null;
      }
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      const bar = this.bar;
      if (bar) bar.speechLevel = 0;
    }

    duckMusic(factor) {
      const ga = window.gameAudio;
      if (!ga) return;
      const vol = ga.musicVolume * factor;
      try {
        if (ga.ytReady && ga.yt && ga.yt.setVolume) ga.yt.setVolume(Math.round(vol * 100));
        if (ga.musicGain && ga.ctx) ga.musicGain.gain.setTargetAtTime(vol, ga.ctx.currentTime, 0.25);
      } catch (e) { /* music engine not ready */ }
    }

    // ============================================================
    // RENDERING
    // ============================================================
    addBubble(who, text, res, instant) {
      const row = document.createElement('div');
      row.className = `bb-row ${who === 'you' ? 'bb-you' : 'bb-marcus'}${instant ? ' instant' : ''}`;
      const name = who === 'you' ? esc((this.ctx && this.ctx.name) || 'You') : 'Marcus';
      let verdict = '';
      if (res && res.verdict && VERDICTS[res.verdict]) {
        const v = VERDICTS[res.verdict];
        verdict = `
          <div class="bb-verdict ${v.cls}">
            <span class="bv-stamp">${v.icon}</span>
            <div class="bv-body">
              <span class="bv-label">${v.label}</span>
              ${res.verdict_title ? `<span class="bv-title">${esc(res.verdict_title)}</span>` : ''}
              ${res.impact ? `<span class="bv-impact">${esc(res.impact)}</span>` : ''}
            </div>
          </div>`;
      }
      row.innerHTML = `
        <span class="bb-name">${name}</span>
        <div class="bb-bubble"><span class="bb-text">${esc(text)}</span>${verdict}</div>`;
      this.el.log.appendChild(row);
      this.scrollLog();
      return row;
    }

    addDivider(label) {
      const d = document.createElement('div');
      d.className = 'bb-divider';
      d.innerHTML = `<span>${esc(label)}</span>`;
      this.el.log.appendChild(d);
    }

    addTyping() {
      const row = document.createElement('div');
      row.className = 'bb-row bb-marcus';
      row.innerHTML = '<span class="bb-name">Marcus</span><div class="bb-bubble bb-typing"><i></i><i></i><i></i></div>';
      this.el.log.appendChild(row);
      this.scrollLog();
      return row;
    }

    revealVerdict(bubble) {
      const v = bubble.querySelector('.bb-verdict');
      if (!v) return;
      v.classList.add('show');
      const ga = window.gameAudio;
      if (ga && typeof ga.playCashChime === 'function' && v.classList.contains('v-buy')) ga.playCashChime();
      else if (ga && typeof ga.playMarker === 'function') ga.playMarker();
      this.scrollLog();
    }

    typeOut(el, text, duration, token) {
      const start = performance.now();
      const total = Math.max(0.8, duration * 0.92) * 1000;
      const step = () => {
        if (token !== this.speakToken) { el.textContent = text; return; }
        const u = Math.min(1, (performance.now() - start) / total);
        el.textContent = text.slice(0, Math.ceil(text.length * u));
        this.scrollLog();
        if (u < 1) requestAnimationFrame(step);
      };
      step();
    }

    scrollLog() {
      const log = this.el.log;
      log.scrollTop = log.scrollHeight;
    }

    showCaption(text) {
      const c = this.el.caption;
      if (!c) return;
      c.textContent = text;
      c.classList.add('show');
    }

    hideCaption() {
      if (this.el.caption) this.el.caption.classList.remove('show');
    }

    renderGoal() {
      const c = this.ctx || {};
      const g = this.el.goal;
      if (!g) return;
      if (!c.name) {
        g.innerHTML = '<span class="bg-lbl">Unlock your board so Marcus can see your Florida numbers</span>';
        return;
      }
      const pct = c.goalCents ? Math.min(100, (c.savedCents / c.goalCents) * 100) : 0;
      g.innerHTML = `
        <div class="bg-top"><span class="bg-lbl">🌴 ${esc(c.name)}'s Florida Fund</span><span class="bg-val">${pct < 1 && pct > 0 ? '<1' : Math.floor(pct)}%</span></div>
        <div class="bg-track"><span style="width:${pct.toFixed(1)}%"></span></div>
        <div class="bg-sub">${money(c.savedCents)} saved · ${money(Math.max(0, c.goalCents - c.savedCents))} to go</div>`;
    }

    renderChips() {
      const c = this.ctx || {};
      const asks = [
        ['👟', 'New sneakers', 'Thinking about copping some $220 sneakers. Good idea?'],
        ['🍽️', 'Dinner out', 'Is a $60 dinner out this weekend okay?'],
        ['📈', 'How am I doing?', c.name ? 'Real talk, how am I doing on my Florida goal?' : 'How should I think about saving for a big goal?'],
        ['💡', 'Save faster', 'Give me one move to hit my goal faster.']
      ];
      this.el.chips.innerHTML = asks.map(([i, l, q]) => `<button type="button" class="bar-chip" data-ask="${esc(q)}"><span>${i}</span>${esc(l)}</button>`).join('');
    }

    // ============================================================
    // HISTORY (per profile, remembered between visits)
    // ============================================================
    storeKey() {
      return `the_crib_marcus_${(this.ctx && this.ctx.id) || 'guest'}`;
    }

    loadHistory() {
      try {
        const h = JSON.parse(localStorage.getItem(this.storeKey()) || '[]');
        return Array.isArray(h) ? h.filter((x) => x && x.role && x.text).slice(-HISTORY_MAX) : [];
      } catch (e) {
        return [];
      }
    }

    pushHistory(role, text) {
      this.history.push({ role, text, t: Date.now() });
      this.history = this.history.slice(-HISTORY_MAX);
      try { localStorage.setItem(this.storeKey(), JSON.stringify(this.history)); } catch (e) { /* storage full */ }
    }

    // ============================================================
    // MIC (push to talk)
    // ============================================================
    setupMic() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const btn = this.el.mic;
      if (!btn) return;
      if (!SR) {
        btn.classList.add('unsupported');
        btn.title = 'Voice input isn\'t supported in this browser';
        return;
      }
      btn.addEventListener('click', () => (this.listening ? this.stopMic() : this.startMic(SR)));
    }

    startMic(SR) {
      if (this.busy) return;
      this.stopAudio();
      const r = new SR();
      r.lang = 'en-US';
      r.interimResults = true;
      r.maxAlternatives = 1;
      let finalText = '';
      r.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const tr = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalText += tr;
          else interim += tr;
        }
        this.el.input.value = (finalText + interim).trim();
      };
      r.onend = () => {
        this.listening = false;
        this.el.mic.classList.remove('live');
        const text = this.el.input.value.trim();
        if (text && finalText) {
          this.el.input.value = '';
          this.send(text);
        } else if (this.bar && !this.busy) {
          this.bar.setMode('idle');
          this.setStatus('At the bar', 'idle');
        }
      };
      r.onerror = () => { /* onend follows */ };
      this.recog = r;
      this.listening = true;
      this.el.mic.classList.add('live');
      if (this.bar) this.bar.setMode('listening');
      this.setStatus('Listening…', 'listen');
      try { r.start(); } catch (e) { this.listening = false; this.el.mic.classList.remove('live'); }
    }

    stopMic() {
      if (this.recog && this.listening) {
        try { this.recog.stop(); } catch (e) { /* not running */ }
      }
      this.listening = false;
      if (this.el.mic) this.el.mic.classList.remove('live');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.marcus = new MarcusChat();
  });
})();
