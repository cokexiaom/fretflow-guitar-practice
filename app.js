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
    audioContext ||= new AC();
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  function playGuitarNote(midi, duration = 1.25) {
    const ctx = getAudio();
    const now = ctx.currentTime;
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const master = ctx.createGain();
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass'; body.frequency.value = 2800; body.Q.value = .5;
    master.gain.setValueAtTime(.0001, now);
    master.gain.exponentialRampToValueAtTime(.34, now + .012);
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

  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // Navigation and theme
  $$('.nav-item').forEach(button => button.addEventListener('click', () => {
    $$('.nav-item').forEach(item => item.classList.toggle('active', item === button));
    $$('.view').forEach(view => view.classList.remove('active'));
    $(`#${button.dataset.view}-view`).classList.add('active');
    if (button.dataset.view === 'stats') renderStats();
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
  const quiz = { round: 1, correct: 0, streak: 0, target: 60, locked: false };
  const scalePitchClasses = () => {
    const root = Number(rootSelect.value);
    return SCALES[$('#scale-select').value].intervals.map(interval => (root + interval) % 12);
  };
  function randomTarget() {
    const pool = scalePitchClasses();
    const pc = pool[Math.floor(Math.random() * pool.length)];
    return 48 + pc + (Math.random() > .45 ? 12 : 0);
  }
  function shuffled(values) { return values.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]); }
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
    if (resetRound || quiz.round > 10) {
      if (quiz.round > 10) {
        stats.sessions.unshift({ date: new Date().toISOString(), type: '音阶训练', score: `${quiz.correct}/10` });
        stats.sessions = stats.sessions.slice(0, 12); saveStats(); toast(`本轮完成：答对 ${quiz.correct} 题`);
      }
      quiz.round = 1; quiz.correct = 0; quiz.streak = 0;
    }
    quiz.target = randomTarget(); quiz.locked = false;
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
    feedback.textContent = good ? `准确！这是 ${NOTE_NAMES[pc]} · ${SOLFEGE[pc]}` : `这是 ${NOTE_NAMES[quiz.target % 12]}，再听一次它的音色`;
    $('#next-question').disabled = false;
  }
  $('#play-question').addEventListener('click', () => {
    playGuitarNote(quiz.target); $('#play-question').classList.add('playing'); setTimeout(() => $('#play-question').classList.remove('playing'), 180);
  });
  $('#next-question').addEventListener('click', () => { quiz.round++; newQuestion(); if ($('#mode-select').value !== 'play') setTimeout(() => playGuitarNote(quiz.target), 120); });
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
  let micStream, analyser, micAnimation, micActive = false, stablePc = null, stableFrames = 0, lastCaptured = null;
  const pitchHistory = Array(120).fill(null);
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
      const ctx = getAudio(); analyser = ctx.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = .15;
      ctx.createMediaStreamSource(micStream).connect(analyser); micActive = true;
      $('#mic-toggle').classList.add('active'); $('#mic-toggle span').textContent = '停止实时拾音'; $('#mic-status').classList.add('live'); $('#mic-status').lastChild.textContent = '正在聆听';
      listenPitch();
    } catch (error) { toast(error.name === 'NotAllowedError' ? '需要允许麦克风权限才能识别琴音' : '无法启动麦克风，请检查输入设备'); }
  }
  function stopMic() {
    micActive = false; cancelAnimationFrame(micAnimation); micStream?.getTracks().forEach(track => track.stop()); micStream = null;
    $('#mic-toggle').classList.remove('active'); $('#mic-toggle span').textContent = '开启实时拾音'; $('#mic-status').classList.remove('live'); $('#mic-status').lastChild.textContent = '麦克风未开启';
    $('#detected-note').textContent = '--'; $('#detected-octave').textContent = ''; $('#frequency-label').textContent = '等待你的琴声'; $('#tuning-feedback').textContent = '开启麦克风后，弹一个清晰的单音'; updateFretboard();
  }
  function listenPitch() {
    if (!micActive) return; const buffer = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buffer);
    const frequency = autoCorrelate(buffer, audioContext.sampleRate);
    if (frequency) {
      const info = frequencyInfo(frequency); $('#detected-note').textContent = NOTE_NAMES[info.pc]; $('#detected-octave').textContent = info.octave; $('#frequency-label').textContent = `${frequency.toFixed(1)} Hz · ${info.cents > 0 ? '+' : ''}${info.cents} cents`;
      $('#tuner-needle').style.left = `${Math.max(2, Math.min(98, info.cents + 50))}%`; $('#tuner-needle').classList.toggle('in-tune', Math.abs(info.cents) <= 5);
      $('#tuning-feedback').textContent = Math.abs(info.cents) <= 5 ? '音准很好' : info.cents < 0 ? '略低，稍微拧紧或提高指压' : '略高，稍微放松';
      if (stablePc === info.pc) stableFrames++; else { stablePc = info.pc; stableFrames = 0; }
      if (stableFrames === 8) {
        updateFretboard(info.pc);
        if (lastCaptured !== info.midi) { stats.notes++; stats.noteCounts[NOTE_NAMES[info.pc]] = (stats.noteCounts[NOTE_NAMES[info.pc]] || 0) + 1; lastCaptured = info.midi; saveStats(); }
        if ($('#mode-select').value === 'play' && !quiz.locked && info.pc === quiz.target % 12) answerQuestion(null, info.pc, true);
      }
      pitchHistory.push(info.cents); pitchHistory.shift();
    } else { pitchHistory.push(null); pitchHistory.shift(); }
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
  function toggleMetro() {
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

  buildBeats(); newQuestion(); updateFretboard(); renderStats(); drawPitchTrace();
})();
