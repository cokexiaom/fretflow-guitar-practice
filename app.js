(() => {
  'use strict';

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SOLFEGE = ['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'];
  const SCALES = {
    major: { name: '自然大调', intervals: [0, 2, 4, 5, 7, 9, 11] },
    minor: { name: '自然小调', intervals: [0, 2, 3, 5, 7, 8, 10] },
    pentatonic: { name: '小调五声音阶', intervals: [0, 3, 5, 7, 10] },
    blues: { name: '布鲁斯音阶', intervals: [0, 3, 5, 6, 7, 10] },
    dorian: { name: '多利亚调式', intervals: [0, 2, 3, 5, 7, 9, 10] },
    mixolydian: { name: '混合利底亚', intervals: [0, 2, 4, 5, 7, 9, 10] }
  };
  const STRINGS = [64, 59, 55, 50, 45, 40];
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const todayKey = () => new Date().toISOString().slice(0, 10);

  const defaultStats = { total: 0, correct: 0, bestStreak: 0, notes: 0, minutes: {}, sessions: [], noteCounts: {} };
  let stats;
  try { stats = { ...defaultStats, ...JSON.parse(localStorage.getItem('fretflow-stats') || '{}') }; }
  catch { stats = { ...defaultStats }; }
  const saveStats = () => localStorage.setItem('fretflow-stats', JSON.stringify(stats));
  const sessionStarted = Date.now();
  window.addEventListener('beforeunload', () => {
    const minutes = Math.max(1, Math.round((Date.now() - sessionStarted) / 60000));
    stats.minutes[todayKey()] = (stats.minutes[todayKey()] || 0) + minutes;
    saveStats();
  });

  let audioContext;
  function getAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('当前浏览器不支持 Web Audio');
    audioContext ||= new AC({ latencyHint: 'interactive' });
    return audioContext;
  }

  async function ensureAudioReady() {
    const ctx = getAudio();
    if (ctx.state === 'suspended') await ctx.resume();

    // iOS needs a source to start inside the same user gesture that resumes audio.
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    if (ctx.state !== 'running') throw new Error('音频仍处于暂停状态');
    return ctx;
  }

  async function playGuitarNote(midi, duration = 1.25) {
    const ctx = await ensureAudioReady();
    const now = ctx.currentTime;
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const master = ctx.createGain();
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass'; body.frequency.value = 2800; body.Q.value = .5;
    master.gain.setValueAtTime(.0001, now);
    master.gain.exponentialRampToValueAtTime(.78, now + .012);
    master.gain.exponentialRampToValueAtTime(.0001, now + duration);
    body.connect(master).connect(ctx.destination);
    [1, 2, 3, 4].forEach((partial, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = index === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(frequency * partial, now);
      osc.detune.setValueAtTime(index * 1.7, now);
      gain.gain.value = [1, .25, .11, .05][index];
      osc.connect(gain).connect(body); osc.start(now); osc.stop(now + duration + .03);
    });
  }

  // A first touch primes Web Audio on iOS Safari and embedded mobile browsers.
  document.addEventListener('pointerdown', () => {
    if (!audioContext || audioContext.state !== 'running') ensureAudioReady().catch(() => {});
  }, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
  });

  // Performance mode
  const PERFORMANCE_KEYS = [
    { key: 'c', label: 'C', midi: 48, string: 5, fret: 3 },
    { key: 'd', label: 'D', midi: 50, string: 4, fret: 0 },
    { key: 'e', label: 'E', midi: 40, string: 6, fret: 0 },
    { key: 'f', label: 'F', midi: 41, string: 6, fret: 1 },
    { key: 'g', label: 'G', midi: 43, string: 6, fret: 3 },
    { key: 'a', label: 'A', midi: 45, string: 5, fret: 0 },
    { key: 'b', label: 'B', midi: 47, string: 5, fret: 2 },
    { key: '1', label: 'C↑', midi: 60, string: 2, fret: 1 },
    { key: '2', label: 'D↑', midi: 62, string: 2, fret: 3 },
    { key: '3', label: 'E↑', midi: 64, string: 1, fret: 0 },
    { key: '4', label: 'F↑', midi: 65, string: 1, fret: 1 },
    { key: '5', label: 'G↑', midi: 67, string: 1, fret: 3 },
    { key: '6', label: 'A↑', midi: 57, string: 3, fret: 2 },
    { key: '7', label: 'B↑', midi: 59, string: 2, fret: 0 }
  ];
  const performanceVoices = new Map();
  const performanceHeldKeys = new Set();
  const performancePendingKeys = new Set();
  const musicParticles = [];
  const performanceCanvas = $('#music-flow-canvas');
  const performanceCtx = performanceCanvas.getContext('2d');
  let flowAnimation;

  PERFORMANCE_KEYS.forEach(note => {
    const button = document.createElement('button'); button.className = `performance-key${note.accidental ? ' accidental' : ''}`;
    button.type = 'button'; button.dataset.key = note.key;
    button.innerHTML = `<strong>${note.label}</strong><span>${note.string} 弦${note.fret ? ` ${note.fret} 品` : '空弦'}</span><kbd>${note.key.toUpperCase()}</kbd>`;
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); startPerformanceNote(note); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => button.addEventListener(type, () => stopPerformanceNote(note.key)));
    $('#note-key-grid').append(button);
  });

  function createPerformanceVoice(note) {
    const ctx = getAudio(); const now = ctx.currentTime;
    const output = ctx.createGain(); const filter = ctx.createBiquadFilter(); const vibrato = ctx.createOscillator(); const vibratoGain = ctx.createGain();
    output.gain.setValueAtTime(.0001, now); output.gain.exponentialRampToValueAtTime(.42, now + .018);
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(3200, now); filter.Q.value = .65;
    vibrato.frequency.value = 5.1; vibratoGain.gain.value = 0; vibrato.connect(vibratoGain);
    const oscillators = [
      { type: 'triangle', ratio: 1, level: 1 }, { type: 'sine', ratio: 2, level: .22 }, { type: 'sine', ratio: 3, level: .08 }
    ].map(partial => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = partial.type; osc.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12) * partial.ratio; gain.gain.value = partial.level;
      vibratoGain.connect(osc.detune); osc.connect(gain).connect(filter); osc.start(now); return osc;
    });
    filter.connect(output).connect(ctx.destination); vibrato.start(now);
    return { ctx, output, filter, vibrato, vibratoGain, oscillators, started: performance.now(), held: false, flowTimer: null, holdTimer: null };
  }

  async function startPerformanceNote(note) {
    if (!$('#perform-view').classList.contains('active') || performanceVoices.has(note.key) || performancePendingKeys.has(note.key)) return;
    performanceHeldKeys.add(note.key); performancePendingKeys.add(note.key);
    try { await ensureAudioReady(); } catch { performanceHeldKeys.delete(note.key); performancePendingKeys.delete(note.key); return toast('声音启动失败，请检查设备媒体音量'); }
    performancePendingKeys.delete(note.key);
    const voice = createPerformanceVoice(note); performanceVoices.set(note.key, voice);
    const button = $(`.performance-key[data-key="${note.key}"]`); button?.classList.add('active');
    $('#perform-note').textContent = note.label; $('#perform-duration').textContent = '拨弦短音';
    $('#perform-status-text').textContent = `${note.label} 正在发声`; $('.perform-status').classList.add('live');
    document.dispatchEvent(new CustomEvent('fretflow:strum', { detail: { string: note.string, fret: note.fret } }));
    emitMusicParticle(note, false);
    voice.holdTimer = setTimeout(() => {
      if (!performanceVoices.has(note.key) || !performanceHeldKeys.has(note.key)) return;
      voice.held = true; voice.vibratoGain.gain.linearRampToValueAtTime(8, voice.ctx.currentTime + .18); voice.filter.frequency.linearRampToValueAtTime(2200, voice.ctx.currentTime + .3);
      button?.classList.add('sustained'); $('#perform-duration').textContent = '持续延长音';
      voice.flowTimer = setInterval(() => emitMusicParticle(note, true), 125);
    }, 260);
    if (!performanceHeldKeys.has(note.key)) setTimeout(() => stopPerformanceNote(note.key), 120);
  }

  function stopPerformanceNote(key) {
    performanceHeldKeys.delete(key);
    const voice = performanceVoices.get(key); if (!voice) return;
    clearTimeout(voice.holdTimer); clearInterval(voice.flowTimer); const now = voice.ctx.currentTime; const release = voice.held ? .52 : .2;
    voice.output.gain.cancelScheduledValues(now); voice.output.gain.setValueAtTime(Math.max(.0001, voice.output.gain.value), now); voice.output.gain.exponentialRampToValueAtTime(.0001, now + release);
    voice.oscillators.forEach(osc => osc.stop(now + release + .04)); voice.vibrato.stop(now + release + .04); performanceVoices.delete(key);
    $(`.performance-key[data-key="${key}"]`)?.classList.remove('active', 'sustained');
    if (!performanceVoices.size) { $('#perform-status-text').textContent = '等待演奏'; $('.perform-status').classList.remove('live'); $('#perform-duration').textContent = '轻触音键或使用键盘'; }
  }

  function stopAllPerformanceNotes() { performanceHeldKeys.clear(); [...performanceVoices.keys()].forEach(stopPerformanceNote); }
  document.addEventListener('keydown', event => {
    if (!$('#perform-view').classList.contains('active') || event.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    const note = PERFORMANCE_KEYS.find(item => item.key === event.key.toLowerCase()); if (!note) return; event.preventDefault(); startPerformanceNote(note);
  });
  document.addEventListener('keyup', event => { const key = event.key.toLowerCase(); if (performanceVoices.has(key) || performancePendingKeys.has(key) || performanceHeldKeys.has(key)) { event.preventDefault(); stopPerformanceNote(key); } });
  window.addEventListener('blur', stopAllPerformanceNotes);

  function emitMusicParticle(note, sustained) {
    const hue = 72 + (note.midi - 60) * 13;
    musicParticles.push({ x: .53, y: .49, life: 0, speed: sustained ? .0022 : .0034, amp: sustained ? .032 : .018, phase: Math.random() * Math.PI * 2, symbol: sustained ? '♪' : ['♪', '♫', '♩'][Math.floor(Math.random() * 3)], hue, sustained });
    if (!flowAnimation) flowAnimation = requestAnimationFrame(drawMusicFlow);
  }
  function drawMusicFlow() {
    const rect = performanceCanvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); const width = Math.max(1, Math.round(rect.width * dpr)); const height = Math.max(1, Math.round(rect.height * dpr));
    if (performanceCanvas.width !== width || performanceCanvas.height !== height) { performanceCanvas.width = width; performanceCanvas.height = height; }
    performanceCtx.clearRect(0, 0, width, height); performanceCtx.save(); performanceCtx.scale(dpr, dpr);
    musicParticles.forEach(particle => {
      particle.life += particle.speed; particle.x += particle.speed * .76; const fade = Math.sin(Math.min(1, particle.life / .18) * Math.PI / 2) * Math.max(0, 1 - particle.life);
      const x = particle.x * rect.width; const y = (particle.y + Math.sin(particle.life * 36 + particle.phase) * particle.amp) * rect.height;
      performanceCtx.globalAlpha = fade; performanceCtx.fillStyle = `hsl(${particle.hue} 78% 70%)`; performanceCtx.font = `${particle.sustained ? 20 : 27}px Georgia, serif`; performanceCtx.fillText(particle.symbol, x, y);
      if (particle.sustained) { performanceCtx.strokeStyle = `hsla(${particle.hue} 78% 70% / ${fade * .42})`; performanceCtx.lineWidth = 1.4; performanceCtx.beginPath(); for (let i = 0; i < 56; i += 4) { const px = x - i; const py = y + Math.sin((particle.life * 36 - i * .12) + particle.phase) * 10; i ? performanceCtx.lineTo(px, py) : performanceCtx.moveTo(px, py); } performanceCtx.stroke(); }
    });
    performanceCtx.restore();
    for (let i = musicParticles.length - 1; i >= 0; i--) if (musicParticles[i].life >= 1) musicParticles.splice(i, 1);
    flowAnimation = musicParticles.length ? requestAnimationFrame(drawMusicFlow) : null;
  }

  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // Navigation and theme
  $$('.nav-item').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.view !== 'perform') stopAllPerformanceNotes();
    $$('.nav-item').forEach(item => item.classList.toggle('active', item === button));
    $$('.view').forEach(view => view.classList.remove('active'));
    $(`#${button.dataset.view}-view`).classList.add('active');
    if (button.dataset.view === 'perform') requestAnimationFrame(() => document.dispatchEvent(new Event('fretflow:stage-resize')));
    if (button.dataset.view === 'stats') renderStats();
    if (button.dataset.view === 'scores') renderScores();
  }));
  const preferredLight = localStorage.getItem('fretflow-theme') === 'light';
  document.documentElement.classList.toggle('light', preferredLight);
  $('#theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    localStorage.setItem('fretflow-theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
    drawPitchTrace();
  });

  // Scale trainer
  const rootSelect = $('#root-select');
  NOTE_NAMES.forEach((note, index) => rootSelect.add(new Option(note, index, false, index === 0)));
  const quiz = { round: 1, correct: 0, streak: 0, target: 60, locked: false, queue: [], advanceTimer: null };
  const scalePitchClasses = () => {
    const root = Number(rootSelect.value);
    return SCALES[$('#scale-select').value].intervals.map(interval => (root + interval) % 12);
  };
  function shuffled(values) { return values.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]); }
  function buildQuestionQueue() {
    const queue = [];
    while (queue.length < 10) {
      const cycle = shuffled(scalePitchClasses());
      if (queue.length && cycle[0] === queue.at(-1) && cycle.length > 1) [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
      queue.push(...cycle);
    }
    return queue.slice(0, 10).map(pc => 48 + pc + (Math.random() > .45 ? 12 : 0));
  }
  function renderAnswers() {
    const mode = $('#mode-select').value;
    const targetPc = quiz.target % 12;
    const candidates = new Set([targetPc]);
    while (candidates.size < 4) candidates.add(Math.floor(Math.random() * 12));
    $('#answer-grid').innerHTML = '';
    shuffled([...candidates]).forEach(pc => {
      const button = document.createElement('button'); button.className = 'answer-btn';
      button.textContent = mode === 'fret' ? SOLFEGE[pc] : NOTE_NAMES[pc];
      button.dataset.pc = pc; button.addEventListener('click', () => answerQuestion(button, pc));
      $('#answer-grid').append(button);
    });
  }
  function newQuestion(resetRound = false) {
    clearTimeout(quiz.advanceTimer);
    if (resetRound || quiz.round > 10) {
      if (quiz.round > 10) {
        stats.sessions.unshift({ date: new Date().toISOString(), type: '音阶训练', score: `${quiz.correct}/10` });
        stats.sessions = stats.sessions.slice(0, 12); saveStats(); toast(`本轮完成：答对 ${quiz.correct} 题`);
      }
      quiz.round = 1; quiz.correct = 0; quiz.streak = 0;
      quiz.queue = buildQuestionQueue();
    }
    if (!quiz.queue.length) quiz.queue = buildQuestionQueue();
    quiz.target = quiz.queue[quiz.round - 1]; quiz.locked = false;
    $('#question-progress').textContent = `${quiz.round} / 10`;
    $('#question-progress-bar').style.width = `${quiz.round * 10}%`;
    $('#question-feedback').className = 'question-feedback';
    $('#question-feedback').textContent = $('#mode-select').value === 'play' ? '开启实时拾音，然后弹出目标音' : '选择你听到的音名';
    $('#next-question').disabled = true;
    const mode = $('#mode-select').value;
    $('#trainer-title').textContent = { listen: '听音辨音', fret: '唱名辨音', play: '弹奏跟练' }[mode];
    $('#question-copy').textContent = mode === 'play' ? `请弹出 ${NOTE_NAMES[quiz.target % 12]} 音` : mode === 'fret' ? '这个音的固定唱名是？' : '听一听，这是哪个音？';
    $('#play-question').querySelector('span').textContent = mode === 'play' ? NOTE_NAMES[quiz.target % 12] : '播放音符';
    $('#answer-grid').style.display = mode === 'play' ? 'none' : 'grid';
    if (mode !== 'play') renderAnswers();
    updateFretboard();
  }
  async function advanceQuestion() {
    clearTimeout(quiz.advanceTimer);
    quiz.advanceTimer = null;
    quiz.round++;
    newQuestion();
    if ($('#mode-select').value !== 'play') {
      try { await playGuitarNote(quiz.target); }
      catch { toast('声音启动失败，请再次点击播放音符'); }
    }
  }
  function answerQuestion(button, pc, fromMic = false) {
    if (quiz.locked) return;
    quiz.locked = true; const good = pc === quiz.target % 12;
    stats.total++; quiz.streak = good ? quiz.streak + 1 : 0;
    if (good) { stats.correct++; quiz.correct++; stats.bestStreak = Math.max(stats.bestStreak, quiz.streak); }
    saveStats();
    if (!fromMic) {
      $$('.answer-btn').forEach(item => { item.disabled = true; if (Number(item.dataset.pc) === quiz.target % 12) item.classList.add('correct'); });
      if (!good) button.classList.add('wrong');
    }
    const feedback = $('#question-feedback'); feedback.className = `question-feedback ${good ? 'good' : 'bad'}`;
    feedback.textContent = good ? `准确！这是 ${NOTE_NAMES[pc]} · ${SOLFEGE[pc]}，即将进入下一题` : `这是 ${NOTE_NAMES[quiz.target % 12]}，即将进入下一题`;
    $('#next-question').disabled = false;
    quiz.advanceTimer = setTimeout(advanceQuestion, 1100);
  }
  $('#play-question').addEventListener('click', async () => {
    try {
      await playGuitarNote(quiz.target);
      $('#play-question').classList.add('playing'); setTimeout(() => $('#play-question').classList.remove('playing'), 180);
    } catch {
      toast('声音启动失败，请调高媒体音量并关闭手机静音模式');
    }
  });
  $('#next-question').addEventListener('click', advanceQuestion);
  $('#reveal-answer').addEventListener('click', () => {
    if (quiz.locked) return;
    quiz.locked = true; quiz.streak = 0; stats.total++; saveStats();
    const correct = $(`.answer-btn[data-pc="${quiz.target % 12}"]`);
    if (correct) {
      $$('.answer-btn').forEach(item => { item.disabled = true; if (item === correct) item.classList.add('correct'); });
    }
    $('#question-feedback').className = 'question-feedback';
    $('#question-feedback').textContent = `答案是 ${NOTE_NAMES[quiz.target % 12]} · ${SOLFEGE[quiz.target % 12]}`;
    $('#next-question').disabled = false;
  });
  ['scale-select', 'root-select', 'mode-select'].forEach(id => $(`#${id}`).addEventListener('change', () => newQuestion(true)));

  function updateFretboard(heardPc = null) {
    const scale = scalePitchClasses(); const root = Number(rootSelect.value); const board = $('#fretboard'); board.innerHTML = '<div></div>';
    for (let fret = 0; fret <= 12; fret++) { const label = document.createElement('div'); label.className = 'fret-label'; label.textContent = fret; board.append(label); }
    STRINGS.forEach((openMidi, stringIndex) => {
      const stringLabel = document.createElement('div'); stringLabel.className = 'string-label'; stringLabel.textContent = NOTE_NAMES[openMidi % 12]; board.append(stringLabel);
      for (let fret = 0; fret <= 12; fret++) {
        const pc = (openMidi + fret) % 12; const cell = document.createElement('div'); cell.className = `fret-cell${fret === 0 ? ' open' : ''}`; cell.style.setProperty('--string-width', `${Math.max(1, (stringIndex + 1) * .35)}px`);
        const marker = document.createElement('span'); marker.className = 'note-marker';
        if (scale.includes(pc)) { marker.classList.add('scale'); marker.textContent = NOTE_NAMES[pc]; }
        if (pc === root) marker.classList.add('root');
        if (pc === heardPc) { marker.classList.add('heard'); marker.textContent = NOTE_NAMES[pc]; }
        cell.append(marker); board.append(cell);
      }
    });
    $('#scale-description').textContent = `${NOTE_NAMES[root]} ${SCALES[$('#scale-select').value].name} · 0–12 品`;
  }

  // Microphone pitch detection
  let micStream, analyser, micAnimation, micActive = false, stablePc = null, stableFrames = 0, lastCaptured = null, currentCents = 0;
  const pitchHistory = Array(120).fill(null);
  const guitarPositions = (midi) => STRINGS.flatMap((openMidi, stringIndex) => {
    const fret = midi - openMidi;
    return fret >= 0 && fret <= 20 ? [{ string: stringIndex + 1, fret, openMidi }] : [];
  }).sort((a, b) => a.fret - b.fret || a.string - b.string);

  function drawTunerDial(cents = 0, active = false) {
    const canvas = $('#tuner-dial'); const ctx = canvas.getContext('2d'); const styles = getComputedStyle(document.documentElement);
    const width = canvas.width, centerX = width / 2, centerY = 195, radius = 174;
    const line = styles.getPropertyValue('--line').trim(), muted = styles.getPropertyValue('--muted').trim();
    const lime = styles.getPropertyValue('--lime').trim(), cyan = styles.getPropertyValue('--cyan').trim();
    ctx.clearRect(0, 0, width, canvas.height);
    ctx.lineCap = 'round';
    for (let value = -50; value <= 50; value += 5) {
      const angle = Math.PI * (1.12 + (value + 50) / 100 * .76);
      const major = value % 25 === 0, inner = radius - (major ? 19 : 10);
      ctx.strokeStyle = value === 0 ? lime : line; ctx.lineWidth = value === 0 ? 3 : major ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner); ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius); ctx.stroke();
      if (major) { ctx.fillStyle = value === 0 ? lime : muted; ctx.font = '14px ui-monospace'; ctx.textAlign = 'center'; ctx.fillText(value > 0 ? `+${value}` : `${value}`, centerX + Math.cos(angle) * (radius - 34), centerY + Math.sin(angle) * (radius - 34)); }
    }
    const bounded = Math.max(-50, Math.min(50, cents)); const needleAngle = Math.PI * (1.12 + (bounded + 50) / 100 * .76);
    ctx.strokeStyle = active && Math.abs(cents) <= 5 ? lime : active ? cyan : muted; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.lineTo(centerX + Math.cos(needleAngle) * (radius - 42), centerY + Math.sin(needleAngle) * (radius - 42)); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(centerX, centerY, 8, 0, Math.PI * 2); ctx.fill();
  }

  function updateGuitarPosition(info) {
    const positions = guitarPositions(info.midi); const best = positions[0];
    $$('#string-strip span').forEach(item => item.classList.toggle('active', Number(item.dataset.midi) === info.midi));
    if (!best) { $('#string-position').textContent = '指板范围外'; $('#alternate-positions').textContent = '标准调弦 0–20 品'; return; }
    $('#string-position').textContent = `${best.string} 弦 · ${best.fret === 0 ? '空弦' : `${best.fret} 品`}`;
    $('#alternate-positions').textContent = positions.slice(1, 4).map(item => `${item.string}弦${item.fret}品`).join(' · ') || (best.fret === 0 ? '标准空弦音' : '唯一常用位置');
  }
  function autoCorrelate(buffer, sampleRate) {
    const size = Math.min(2048, buffer.length); let mean = 0;
    for (let i = 0; i < size; i++) mean += buffer[i]; mean /= size;
    let rms = 0; for (let i = 0; i < size; i++) { const value = buffer[i] - mean; rms += value * value; }
    rms = Math.sqrt(rms / size); if (rms < .012) return null;
    const minLag = Math.floor(sampleRate / 1100); const maxLag = Math.min(Math.floor(sampleRate / 70), size / 2);
    const correlations = new Float32Array(maxLag + 1); let strongest = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0, energyA = 0, energyB = 0;
      for (let i = 0; i < size - lag; i++) {
        const a = buffer[i] - mean, b = buffer[i + lag] - mean;
        sum += a * b; energyA += a * a; energyB += b * b;
      }
      const correlation = sum / Math.sqrt(energyA * energyB || 1);
      correlations[lag] = correlation; strongest = Math.max(strongest, correlation);
    }
    if (strongest < .72) return null;
    let bestLag = -1;
    for (let lag = minLag + 1; lag < maxLag; lag++) {
      const isPeak = correlations[lag] > correlations[lag - 1] && correlations[lag] >= correlations[lag + 1];
      if (isPeak && correlations[lag] >= strongest * .92) { bestLag = lag; break; }
    }
    if (bestLag < 0) return null;
    const left = correlations[bestLag - 1], center = correlations[bestLag], right = correlations[bestLag + 1];
    const adjustment = (left - right) / (2 * (left - 2 * center + right) || 1);
    return sampleRate / (bestLag + Math.max(-.5, Math.min(.5, adjustment)));
  }
  function frequencyInfo(frequency) {
    const midiFloat = 69 + 12 * Math.log2(frequency / 440); const midi = Math.round(midiFloat);
    return { midi, pc: ((midi % 12) + 12) % 12, octave: Math.floor(midi / 12) - 1, cents: Math.round((midiFloat - midi) * 100) };
  }
  async function toggleMic() {
    if (micActive) return stopMic();
    if (!navigator.mediaDevices?.getUserMedia) { toast('当前浏览器不支持麦克风拾音'); return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ctx = await ensureAudioReady(); analyser = ctx.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = .15;
      ctx.createMediaStreamSource(micStream).connect(analyser); micActive = true;
      $('#mic-toggle').classList.add('active'); $('#mic-toggle span').textContent = '停止实时拾音'; $('#mic-status').classList.add('live'); $('#mic-status').lastChild.textContent = '正在聆听';
      listenPitch();
    } catch (error) { toast(error.name === 'NotAllowedError' ? '需要允许麦克风权限才能识别琴音' : '无法启动麦克风，请检查输入设备'); }
  }
  function stopMic() {
    micActive = false; cancelAnimationFrame(micAnimation); micStream?.getTracks().forEach(track => track.stop()); micStream = null;
    $('#mic-toggle').classList.remove('active'); $('#mic-toggle span').textContent = '开启实时拾音'; $('#mic-status').classList.remove('live'); $('#mic-status').lastChild.textContent = '麦克风未开启';
    $('#detected-note').textContent = '--'; $('#detected-octave').textContent = ''; $('#frequency-label').textContent = '等待你的琴声'; $('#tuning-feedback').textContent = '开启麦克风后，弹一个清晰的单音';
    $('#string-position').textContent = '--'; $('#alternate-positions').textContent = '标准调弦'; $('#cents-value').textContent = '--'; $('#signal-value').textContent = '0%'; $('#signal-bar').style.width = '0'; $('#trace-note').textContent = '等待输入';
    $$('#string-strip span').forEach(item => item.classList.remove('active')); currentCents = 0; drawTunerDial(); updateFretboard();
  }
  function listenPitch() {
    if (!micActive) return; const buffer = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buffer);
    let rms = 0; for (const sample of buffer) rms += sample * sample; rms = Math.sqrt(rms / buffer.length);
    const signal = Math.round(Math.max(0, Math.min(100, (rms - .006) / .16 * 100)));
    $('#signal-value').textContent = `${signal}%`; $('#signal-bar').style.width = `${signal}%`;
    const frequency = autoCorrelate(buffer, audioContext.sampleRate);
    if (frequency) {
      const info = frequencyInfo(frequency); $('#detected-note').textContent = NOTE_NAMES[info.pc]; $('#detected-octave').textContent = info.octave; $('#frequency-label').textContent = `${frequency.toFixed(1)} Hz · ${info.cents > 0 ? '+' : ''}${info.cents} cents`;
      currentCents += (info.cents - currentCents) * .28; drawTunerDial(currentCents, true); updateGuitarPosition(info);
      $('#cents-value').textContent = `${info.cents > 0 ? '+' : ''}${info.cents}`; $('#trace-note').textContent = `${NOTE_NAMES[info.pc]}${info.octave} · ${frequency.toFixed(1)} Hz`;
      $('#tuner-needle').style.left = `${Math.max(2, Math.min(98, info.cents + 50))}%`; $('#tuner-needle').classList.toggle('in-tune', Math.abs(info.cents) <= 5);
      $('#tuning-feedback').textContent = Math.abs(info.cents) <= 5 ? '音准准确 · 保持' : info.cents < 0 ? `偏低 ${Math.abs(info.cents)} 音分 · 调高` : `偏高 ${info.cents} 音分 · 调低`;
      if (stablePc === info.pc) stableFrames++; else { stablePc = info.pc; stableFrames = 0; }
      if (stableFrames === 8) {
        updateFretboard(info.pc);
        if (lastCaptured !== info.midi) { stats.notes++; stats.noteCounts[NOTE_NAMES[info.pc]] = (stats.noteCounts[NOTE_NAMES[info.pc]] || 0) + 1; lastCaptured = info.midi; saveStats(); }
        if ($('#mode-select').value === 'play' && !quiz.locked && info.pc === quiz.target % 12) answerQuestion(null, info.pc, true);
      }
      pitchHistory.push(info.cents); pitchHistory.shift();
    } else { pitchHistory.push(null); pitchHistory.shift(); if (signal < 5) drawTunerDial(currentCents, false); }
    drawPitchTrace(); micAnimation = requestAnimationFrame(listenPitch);
  }
  function drawPitchTrace() {
    const canvas = $('#pitch-canvas'); const ctx = canvas.getContext('2d'); const styles = getComputedStyle(document.documentElement);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = styles.getPropertyValue('--line'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
    ctx.strokeStyle = styles.getPropertyValue('--cyan'); ctx.lineWidth = 2; ctx.beginPath(); let started = false;
    pitchHistory.forEach((value, i) => { if (value === null) { started = false; return; } const x = i / (pitchHistory.length - 1) * canvas.width; const y = canvas.height / 2 - value / 50 * (canvas.height * .42); if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); }); ctx.stroke();
  }
  $('#mic-toggle').addEventListener('click', toggleMic);

  // Metronome
  const metro = { running: false, timer: null, next: 0, beat: 0, subdivision: 0, bars: 0, accents: [2, 1, 1, 1], taps: [], master: null };
  const bpmSlider = $('#bpm-slider'), bpmNumber = $('#bpm-number');
  function tempoName(bpm) { if (bpm < 40) return 'Grave'; if (bpm < 60) return 'Largo'; if (bpm < 76) return 'Adagio'; if (bpm < 108) return 'Andante'; if (bpm < 120) return 'Moderato'; if (bpm < 168) return 'Allegro'; if (bpm < 200) return 'Presto'; return 'Prestissimo'; }
  function setBpm(value) { value = Math.max(20, Math.min(300, Math.round(Number(value) || 90))); bpmNumber.value = bpmSlider.value = value; $('#tempo-name').textContent = tempoName(value); }
  function buildBeats() {
    const beats = Number($('#time-signature').value); metro.accents = Array.from({ length: beats }, (_, i) => metro.accents[i] ?? (i === 0 ? 2 : 1));
    $('#beat-lights').innerHTML = metro.accents.map((accent, i) => `<span class="beat-light${accent === 2 ? ' accent' : ''}" data-beat="${i}">${i + 1}</span>`).join('');
    $('#accent-editor').innerHTML = metro.accents.map((accent, i) => `<button class="accent-beat ${accent === 2 ? 'strong' : accent === 0 ? 'muted' : ''}" data-accent="${i}" type="button">${i + 1}</button>`).join('');
    $$('.accent-beat').forEach(button => button.addEventListener('click', () => { const i = Number(button.dataset.accent); metro.accents[i] = (metro.accents[i] + 1) % 3; buildBeats(); }));
  }
  function metroClick(time, level, subdivision) {
    if (level === 0) return; const ctx = getAudio(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); const type = $('#click-sound').value;
    osc.type = type === 'digital' ? 'square' : type === 'rim' ? 'triangle' : 'sine';
    const base = type === 'rim' ? 520 : type === 'digital' ? 1100 : 760; osc.frequency.value = subdivision ? base * .72 : base * (level === 2 ? 1.35 : 1);
    const volume = Number($('#metro-volume').value) * (subdivision ? .38 : level === 2 ? 1 : .68); gain.gain.setValueAtTime(volume, time); gain.gain.exponentialRampToValueAtTime(.001, time + (type === 'wood' ? .07 : .035));
    osc.connect(gain).connect(ctx.destination); osc.start(time); osc.stop(time + .08);
  }
  function scheduler() {
    const ctx = getAudio(), bpm = Number(bpmNumber.value), subdivisions = Number($('#subdivision').value), beatLength = 60 / bpm;
    while (metro.next < ctx.currentTime + .1) {
      const isMain = metro.subdivision === 0; const currentBeat = metro.beat; metroClick(metro.next, metro.accents[currentBeat], !isMain);
      const delay = Math.max(0, (metro.next - ctx.currentTime) * 1000); setTimeout(() => visualBeat(currentBeat, isMain), delay);
      const swing = subdivisions === 2 ? Number($('#swing-ratio').value) / 100 : .5;
      const interval = subdivisions === 2 ? beatLength * (metro.subdivision === 0 ? swing : 1 - swing) : beatLength / subdivisions;
      metro.next += interval; metro.subdivision++;
      if (metro.subdivision >= subdivisions) { metro.subdivision = 0; metro.beat++; if (metro.beat >= metro.accents.length) { metro.beat = 0; metro.bars++; maybeAccelerate(); } }
    }
  }
  function visualBeat(beat, isMain) {
    if (!metro.running || !isMain) return; $$('.beat-light').forEach((el, i) => el.classList.toggle('active', i === beat));
    if ($('#flash-toggle').checked) { const flash = $('#edge-flash'); flash.classList.remove('fire'); void flash.offsetWidth; flash.classList.add('fire'); }
  }
  function maybeAccelerate() { if (!$('#trainer-toggle').checked || metro.bars % 4) return; const target = Number($('#trainer-target').value), step = Number($('#trainer-step').value); if (Number(bpmNumber.value) < target) setBpm(Math.min(target, Number(bpmNumber.value) + step)); }
  async function toggleMetro() {
    if (!metro.running) {
      try { await ensureAudioReady(); }
      catch { toast('声音启动失败，请调高媒体音量并关闭手机静音模式'); return; }
    }
    metro.running = !metro.running; $('#metro-play').classList.toggle('running', metro.running);
    $('#metro-play').setAttribute('aria-label', metro.running ? '停止节拍器' : '开始节拍器');
    if (metro.running) { metro.beat = metro.subdivision = metro.bars = 0; metro.next = getAudio().currentTime + .06; scheduler(); metro.timer = setInterval(scheduler, 25); }
    else { clearInterval(metro.timer); metro.timer = null; $$('.beat-light').forEach(el => el.classList.remove('active')); }
  }
  bpmSlider.addEventListener('input', () => setBpm(bpmSlider.value)); bpmNumber.addEventListener('change', () => setBpm(bpmNumber.value));
  $$('[data-bpm-step]').forEach(button => button.addEventListener('click', () => setBpm(Number(bpmNumber.value) + Number(button.dataset.bpmStep))));
  $('#metro-play').addEventListener('click', toggleMetro); $('#time-signature').addEventListener('change', buildBeats);
  $('#tap-tempo').addEventListener('click', () => { const now = performance.now(); metro.taps.push(now); metro.taps = metro.taps.filter(t => now - t < 2500).slice(-6); if (metro.taps.length > 1) { const gaps = metro.taps.slice(1).map((t, i) => t - metro.taps[i]); setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)); } });
  $('#metro-volume').addEventListener('input', event => $('#volume-output').textContent = `${Math.round(event.target.value * 100)}%`);
  $('#trainer-toggle').addEventListener('change', event => $('#trainer-options').classList.toggle('open', event.target.checked));
  $('#metro-reset').addEventListener('click', () => { if (metro.running) toggleMetro(); setBpm(90); $('#time-signature').value = '4'; $('#subdivision').value = '1'; $('#swing-ratio').value = '50'; $('#click-sound').value = 'wood'; $('#metro-volume').value = '.7'; $('#volume-output').textContent = '70%'; metro.accents = [2, 1, 1, 1]; buildBeats(); toast('节拍器已重置'); });
  document.addEventListener('keydown', event => { if (event.code === 'Space' && $('#metronome-view').classList.contains('active') && !['INPUT', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); toggleMetro(); } });

  // Statistics
  function practiceStreak() {
    let streak = 0, date = new Date();
    while (stats.minutes[date.toISOString().slice(0, 10)] > 0) { streak++; date.setDate(date.getDate() - 1); }
    return streak;
  }
  function renderStats() {
    const elapsed = Math.floor((Date.now() - sessionStarted) / 60000); $('#stat-minutes').textContent = (stats.minutes[todayKey()] || 0) + elapsed;
    $('#stat-accuracy').textContent = stats.total ? `${Math.round(stats.correct / stats.total * 100)}%` : '0%'; $('#stat-answers').textContent = `${stats.total} 道题`; $('#stat-best-streak').textContent = stats.bestStreak; $('#stat-notes').textContent = stats.notes; $('#header-streak').textContent = `连续练习 ${practiceStreak()} 天`;
    const days = []; for (let i = 6; i >= 0; i--) { const date = new Date(); date.setDate(date.getDate() - i); const key = date.toISOString().slice(0, 10); days.push({ key, name: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()], value: stats.minutes[key] || 0 }); }
    const max = Math.max(20, ...days.map(day => day.value)); $('#week-chart').innerHTML = days.map((day, i) => `<div class="day-bar${i === 6 ? ' today' : ''}"><strong>${day.value}m</strong><i style="height:${Math.max(2, day.value / max * 180)}px"></i><span>周${day.name}</span></div>`).join('');
    const maxNote = Math.max(1, ...Object.values(stats.noteCounts)); $('#note-distribution').innerHTML = NOTE_NAMES.map(note => `<div class="note-row"><strong>${note}</strong><div><i style="width:${(stats.noteCounts[note] || 0) / maxNote * 100}%"></i></div><span>${stats.noteCounts[note] || 0}</span></div>`).join('');
    $('#recent-list').innerHTML = stats.sessions.length ? stats.sessions.slice(0, 6).map(session => `<div class="recent-item"><strong>${session.type}</strong><span>${new Date(session.date).toLocaleDateString('zh-CN')}</span><span>${session.score}</span></div>`).join('') : '<div class="empty-state">完成一轮练习后，记录会出现在这里</div>';
  }
  $('#reset-stats').addEventListener('click', () => { if (!confirm('确定清除所有本机练习统计吗？')) return; stats = { ...defaultStats, minutes: {}, sessions: [], noteCounts: {} }; saveStats(); renderStats(); toast('练习统计已清除'); });

  // Local score library
  const SCORE_DB = 'fretflow-score-library';
  let scoreDb, editingScoreId = null, pendingScoreImages = [], scoreObjectUrls = [], editorObjectUrls = [], viewerObjectUrls = [], viewerZoom = 1, viewerPage = 0;
  const scoreImages = (score) => score.images?.length ? score.images : score.image ? [score.image] : [];
  function openScoreDb() {
    if (scoreDb) return Promise.resolve(scoreDb);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SCORE_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('scores', { keyPath: 'id', autoIncrement: true });
      request.onsuccess = () => { scoreDb = request.result; resolve(scoreDb); };
      request.onerror = () => reject(request.error);
    });
  }
  async function scoreStore(mode, operation) {
    const db = await openScoreDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('scores', mode); const store = transaction.objectStore('scores');
      const request = operation(store); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  const getScores = () => scoreStore('readonly', store => store.getAll());
  const getScore = (id) => scoreStore('readonly', store => store.get(id));
  const putScore = (score) => scoreStore('readwrite', store => store.put(score));
  const deleteScore = (id) => scoreStore('readwrite', store => store.delete(id));

  async function optimizeScoreImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
    const bitmap = await createImageBitmap(file); const maxSide = 3000; const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片处理失败')), 'image/jpeg', .9));
  }

  function setModalOpen(element, open) {
    element.classList.toggle('open', open); element.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('modal-open', $$('.modal-layer.open').length > 0);
  }
  function renderPageThumbnails() {
    editorObjectUrls.forEach(URL.revokeObjectURL); editorObjectUrls = []; const container = $('#page-thumbnails'); container.innerHTML = '';
    pendingScoreImages.forEach((blob, index) => {
      const item = document.createElement('div'); item.className = 'page-thumb'; const url = URL.createObjectURL(blob); editorObjectUrls.push(url);
      const image = document.createElement('img'); image.src = url; image.alt = `曲谱第 ${index + 1} 页`;
      const label = document.createElement('span'); label.textContent = `第 ${index + 1} 页`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `删除第 ${index + 1} 页`);
      remove.addEventListener('click', () => { pendingScoreImages.splice(index, 1); renderPageThumbnails(); });
      item.append(image, label, remove); container.append(item);
    });
    $('#image-picker-title').textContent = pendingScoreImages.length ? `继续添加图片（已有 ${pendingScoreImages.length} 页）` : '添加多张图片';
    $('#image-picker-copy').textContent = pendingScoreImages.length ? '新选择的图片会追加到现有页面后面' : '可一次选择多张，支持 JPG、PNG、WEBP';
  }
  async function openScoreModal(scoreId = null) {
    editingScoreId = scoreId; pendingScoreImages = []; $('#score-name-error').textContent = ''; $('#score-name').classList.remove('invalid'); $('#score-image').value = '';
    if (scoreId) {
      const score = await getScore(scoreId); if (!score) return;
      $('#score-modal-title').textContent = '编辑曲谱'; $('#save-score').textContent = '保存修改'; $('#score-name').value = score.name; pendingScoreImages = [...scoreImages(score)]; renderPageThumbnails();
    } else {
      $('#score-modal-title').textContent = '添加曲谱'; $('#save-score').textContent = '添加'; $('#score-name').value = ''; renderPageThumbnails();
    }
    setModalOpen($('#score-modal'), true); setTimeout(() => $('#score-name').focus(), 80);
  }
  function closeScoreModal() { setModalOpen($('#score-modal'), false); editorObjectUrls.forEach(URL.revokeObjectURL); editorObjectUrls = []; $('#page-thumbnails').innerHTML = ''; editingScoreId = null; pendingScoreImages = []; }

  async function saveScore() {
    const name = $('#score-name').value.trim();
    if (!name) { $('#score-name').classList.add('invalid'); $('#score-name-error').textContent = '添加失败：请先填写曲的名字'; $('#score-name').focus(); return; }
    $('#save-score').disabled = true;
    try {
      const existing = editingScoreId ? await getScore(editingScoreId) : null; const now = Date.now();
      const record = { name, images: [...pendingScoreImages], createdAt: existing?.createdAt || now, updatedAt: now };
      if (existing?.id) record.id = existing.id;
      await putScore(record);
      closeScoreModal(); await renderScores(); toast(existing ? '曲谱修改成功' : '曲谱添加成功');
    } catch { toast('保存失败，请检查浏览器存储空间'); }
    finally { $('#save-score').disabled = false; }
  }

  function createScoreCard(score) {
    const images = scoreImages(score);
    const article = document.createElement('article'); article.className = 'score-card';
    const cover = document.createElement('button'); cover.type = 'button'; cover.className = 'score-cover'; cover.setAttribute('aria-label', images.length ? `预览 ${score.name}` : `为 ${score.name} 添加图片`);
    if (images.length) {
      const url = URL.createObjectURL(images[0]); scoreObjectUrls.push(url); const image = document.createElement('img'); image.src = url; image.alt = `${score.name} 曲谱缩略图`; cover.append(image);
      if (images.length > 1) { const badge = document.createElement('span'); badge.className = 'page-count-badge'; badge.textContent = `${images.length} 页`; cover.append(badge); }
      cover.addEventListener('click', () => openScoreViewer(score));
    } else {
      const placeholder = document.createElement('div'); placeholder.className = 'score-placeholder'; placeholder.innerHTML = '<span>＋</span>'; cover.append(placeholder); cover.addEventListener('click', () => openScoreModal(score.id));
    }
    const body = document.createElement('div'); body.className = 'score-card-body'; const title = document.createElement('h2'); title.textContent = score.name;
    const meta = document.createElement('p'); meta.textContent = images.length ? `共 ${images.length} 页 · ${new Date(score.updatedAt).toLocaleDateString('zh-CN')}` : '尚未添加图片';
    const actions = document.createElement('div'); actions.className = 'score-actions';
    const preview = document.createElement('button'); preview.className = 'score-action primary'; preview.type = 'button'; preview.textContent = images.length ? '预览' : '添加图片'; preview.addEventListener('click', () => images.length ? openScoreViewer(score) : openScoreModal(score.id));
    const edit = document.createElement('button'); edit.className = 'score-action'; edit.type = 'button'; edit.textContent = '修改'; edit.addEventListener('click', () => openScoreModal(score.id));
    const remove = document.createElement('button'); remove.className = 'score-action danger'; remove.type = 'button'; remove.textContent = '删除'; remove.addEventListener('click', async () => { if (!confirm(`确定删除《${score.name}》吗？`)) return; await deleteScore(score.id); await renderScores(); toast('曲谱已删除'); });
    actions.append(preview, edit, remove); body.append(title, meta, actions); article.append(cover, body); return article;
  }
  async function renderScores() {
    const grid = $('#score-grid'); if (!grid) return;
    scoreObjectUrls.forEach(URL.revokeObjectURL); scoreObjectUrls = [];
    try {
      const scores = (await getScores()).sort((a, b) => b.updatedAt - a.updatedAt); grid.innerHTML = ''; scores.forEach(score => grid.append(createScoreCard(score)));
      $('#score-count').textContent = scores.length; $('#score-empty').classList.toggle('show', scores.length === 0); grid.style.display = scores.length ? 'grid' : 'none';
    } catch { $('#score-empty').classList.add('show'); toast('无法读取本机曲谱库'); }
  }

  function applyViewerZoom() { $$('#viewer-pages img').forEach(image => image.style.width = `${viewerZoom * 100}%`); $('#viewer-zoom').textContent = `${Math.round(viewerZoom * 100)}%`; }
  function updateViewerPage(index, scroll = false) {
    const pages = $$('#viewer-pages .viewer-page'); if (!pages.length) return; viewerPage = Math.max(0, Math.min(pages.length - 1, index));
    $('#viewer-page').textContent = `${viewerPage + 1} / ${pages.length}`; $('#viewer-prev').disabled = viewerPage === 0; $('#viewer-next').disabled = viewerPage === pages.length - 1;
    if (scroll) pages[viewerPage].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }
  function openScoreViewer(score) {
    const images = scoreImages(score); if (!images.length) return openScoreModal(score.id); viewerObjectUrls.forEach(URL.revokeObjectURL); viewerObjectUrls = [];
    const pages = $('#viewer-pages'); pages.innerHTML = ''; images.forEach((blob, index) => { const page = document.createElement('div'); page.className = 'viewer-page'; const image = document.createElement('img'); const url = URL.createObjectURL(blob); viewerObjectUrls.push(url); image.src = url; image.alt = `${score.name} 第 ${index + 1} 页`; page.append(image); pages.append(page); });
    $('#viewer-title').textContent = score.name; viewerZoom = 1; applyViewerZoom(); setModalOpen($('#score-viewer'), true); pages.scrollLeft = 0; updateViewerPage(0);
  }
  function closeScoreViewer() { setModalOpen($('#score-viewer'), false); viewerObjectUrls.forEach(URL.revokeObjectURL); viewerObjectUrls = []; $('#viewer-pages').innerHTML = ''; }

  $('#add-score').addEventListener('click', () => openScoreModal()); $('#empty-add-score').addEventListener('click', () => openScoreModal());
  $$('[data-close-score-modal]').forEach(item => item.addEventListener('click', closeScoreModal)); $$('[data-close-score-viewer]').forEach(item => item.addEventListener('click', closeScoreViewer));
  $('#score-image-picker').addEventListener('click', () => $('#score-image').click());
  $('#score-image').addEventListener('change', async event => {
    const files = [...event.target.files]; if (!files.length) return; $('#image-picker-copy').textContent = `正在处理 0 / ${files.length}…`;
    try { for (let index = 0; index < files.length; index++) { pendingScoreImages.push(await optimizeScoreImage(files[index])); $('#image-picker-copy').textContent = `正在处理 ${index + 1} / ${files.length}…`; } renderPageThumbnails(); }
    catch (error) { toast(error.message); renderPageThumbnails(); } event.target.value = '';
  });
  $('#score-name').addEventListener('input', () => { $('#score-name').classList.remove('invalid'); $('#score-name-error').textContent = ''; }); $('#score-name').addEventListener('keydown', event => { if (event.key === 'Enter') saveScore(); }); $('#save-score').addEventListener('click', saveScore);
  $('#viewer-zoom-in').addEventListener('click', () => { viewerZoom = Math.min(3, viewerZoom + .25); applyViewerZoom(); }); $('#viewer-zoom-out').addEventListener('click', () => { viewerZoom = Math.max(.5, viewerZoom - .25); applyViewerZoom(); }); $('#viewer-reset').addEventListener('click', () => { viewerZoom = 1; applyViewerZoom(); });
  $('#viewer-prev').addEventListener('click', () => updateViewerPage(viewerPage - 1, true)); $('#viewer-next').addEventListener('click', () => updateViewerPage(viewerPage + 1, true));
  let viewerScrollTimer; $('#viewer-pages').addEventListener('scroll', () => { clearTimeout(viewerScrollTimer); viewerScrollTimer = setTimeout(() => { const pages = $('#viewer-pages'); updateViewerPage(Math.round(pages.scrollLeft / Math.max(1, pages.clientWidth))); }, 80); });
  document.addEventListener('keydown', event => { if ($('#score-viewer').classList.contains('open') && event.key === 'ArrowLeft') return updateViewerPage(viewerPage - 1, true); if ($('#score-viewer').classList.contains('open') && event.key === 'ArrowRight') return updateViewerPage(viewerPage + 1, true); if (event.key !== 'Escape') return; if ($('#score-viewer').classList.contains('open')) closeScoreViewer(); else if ($('#score-modal').classList.contains('open')) closeScoreModal(); });

  buildBeats(); newQuestion(); updateFretboard(); renderStats(); renderScores(); drawPitchTrace(); drawTunerDial();
})();
