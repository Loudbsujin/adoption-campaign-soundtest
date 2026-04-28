(() => {
  'use strict';

  const SOUNDS = [
    { id: 'stew',     label: '보글보글 찌개',  hint: '주방에서 들려오는' },
    { id: 'laughter', label: '예능 웃음소리',  hint: '거실 TV에서' },
    { id: 'scissors', label: '서툰 가위질',    hint: '아이가 만들기 중' },
    { id: 'dishes',   label: '달그락 식기',    hint: '저녁 준비' },
    { id: 'broom',    label: '빗자루질',       hint: '베란다 청소' },
    { id: 'clock',    label: '째깍 시계',      hint: '벽시계 초침' },
  ];

  const FADE_IN_S = 0.8;
  const FADE_OUT_S = 0.6;
  const DEFAULT_VOLUME = 0.7;
  const MIN_SELECTED = 3;
  const REVEAL_COPY_DELAY_MS = 2500;

  let audioCtx = null;
  const tracks = new Map(); // id -> { audio, gain, source, active, volume, ready }

  // ---------- DOM ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const phases = {
    hook: $('#phase-hook'),
    interaction: $('#phase-interaction'),
    reveal: $('#phase-reveal'),
  };
  const grid = $('#sound-grid');
  const startBtn = $('#start-btn');
  const revealBtn = $('#reveal-btn');
  const countNum = $('#count-num');
  const mixSub = $('#mix-sub');
  const revealVideo = $('#reveal-video');
  const revealFallback = $('#reveal-fallback');
  const revealCopy = $('#reveal-copy');

  // ---------- Render sound cards ----------
  function buildCards() {
    const frag = document.createDocumentFragment();
    SOUNDS.forEach((s) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'sound-card';
      card.setAttribute('aria-pressed', 'false');
      card.dataset.id = s.id;
      card.innerHTML = `
        <span class="pulse" aria-hidden="true"></span>
        <span class="label">${s.label}</span>
        <span class="hint">${s.hint}</span>
        <label class="volume" onclick="event.stopPropagation()">
          <svg class="volume-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M5 9v6h4l5 4V5L9 9H5z" stroke-linejoin="round"/>
            <path d="M16.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round"/>
          </svg>
          <input class="volume-slider" type="range" min="0" max="1" step="0.01"
            value="${DEFAULT_VOLUME}" aria-label="${s.label} 볼륨" />
        </label>
      `;
      const slider = card.querySelector('.volume-slider');
      slider.style.setProperty('--fill', `${DEFAULT_VOLUME * 100}%`);

      card.addEventListener('click', (e) => {
        if (e.target.closest('.volume')) return;
        toggleSound(s.id);
      });
      slider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        slider.style.setProperty('--fill', `${v * 100}%`);
        setVolume(s.id, v);
      });
      // Stop propagation on keyboard interaction with the slider too
      slider.addEventListener('keydown', (e) => e.stopPropagation());

      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  // ---------- Audio engine ----------
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    SOUNDS.forEach(prepareTrack);
    return audioCtx;
  }

  function prepareTrack(s) {
    const audio = new Audio(`assets/sounds/${s.id}.mp3`);
    audio.loop = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';

    const gain = audioCtx.createGain();
    gain.gain.value = 0;

    let source = null;
    try {
      source = audioCtx.createMediaElementSource(audio);
      source.connect(gain).connect(audioCtx.destination);
    } catch (err) {
      console.warn(`[${s.id}] could not create source`, err);
    }

    const track = {
      audio, gain, source,
      active: false,
      volume: DEFAULT_VOLUME,
      ready: true,
    };

    audio.addEventListener('error', () => {
      track.ready = false;
      const card = grid.querySelector(`.sound-card[data-id="${s.id}"]`);
      if (card) {
        card.dataset.disabled = 'true';
        const hint = card.querySelector('.hint');
        if (hint) hint.textContent = '준비 중';
      }
      if (track.active) {
        track.active = false;
        updateCount();
      }
    });

    tracks.set(s.id, track);
  }

  function rampGain(track, target, seconds) {
    if (!track || !track.gain) return;
    const now = audioCtx.currentTime;
    const g = track.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + seconds);
  }

  function toggleSound(id) {
    ensureAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const track = tracks.get(id);
    if (!track || !track.ready) return;

    const card = grid.querySelector(`.sound-card[data-id="${id}"]`);

    if (track.active) {
      track.active = false;
      card.setAttribute('aria-pressed', 'false');
      rampGain(track, 0, FADE_OUT_S);
      setTimeout(() => {
        if (!track.active) track.audio.pause();
      }, FADE_OUT_S * 1000 + 80);
    } else {
      track.active = true;
      card.setAttribute('aria-pressed', 'true');
      const playPromise = track.audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => console.warn(`[${id}] play failed`, err));
      }
      rampGain(track, track.volume, FADE_IN_S);
    }

    updateCount();
  }

  function setVolume(id, v) {
    const track = tracks.get(id);
    if (!track) return;
    track.volume = v;
    if (track.active && audioCtx) {
      // Smooth-ish but responsive to slider drag
      rampGain(track, v, 0.08);
    }
  }

  function activeCount() {
    let n = 0;
    tracks.forEach((t) => { if (t.active) n++; });
    return n;
  }

  function updateCount() {
    const n = activeCount();
    countNum.textContent = String(n);
    if (n >= MIN_SELECTED) {
      revealBtn.disabled = false;
      mixSub.textContent = '준비되셨다면 ‘완성’을 눌러 보세요.';
    } else {
      revealBtn.disabled = true;
      mixSub.textContent = `${MIN_SELECTED - n}개의 소리를 더 골라 보세요.`;
    }
  }

  // ---------- Phase transitions ----------
  function setPhase(name) {
    Object.entries(phases).forEach(([key, el]) => {
      el.dataset.active = key === name ? 'true' : 'false';
    });
  }

  function startInteraction() {
    ensureAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    setPhase('interaction');
  }

  function playReveal() {
    setPhase('reveal');

    let videoFailed = false;
    const fallbackToImage = () => {
      if (videoFailed) return;
      videoFailed = true;
      revealVideo.hidden = true;
      revealFallback.hidden = false;
    };

    revealVideo.addEventListener('error', fallbackToImage, { once: true });
    // If no <source> resolves, the network state will be NO_SOURCE
    // after the browser tries; check after a short delay.
    setTimeout(() => {
      if (revealVideo.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
        fallbackToImage();
      }
    }, 600);

    const tryPlay = revealVideo.play();
    if (tryPlay && typeof tryPlay.catch === 'function') {
      tryPlay.catch(fallbackToImage);
    }

    setTimeout(() => {
      revealCopy.classList.add('is-shown');
    }, REVEAL_COPY_DELAY_MS);
  }

  // ---------- Init ----------
  function init() {
    buildCards();
    startBtn.addEventListener('click', startInteraction);
    revealBtn.addEventListener('click', () => {
      if (revealBtn.disabled) return;
      playReveal();
    });
    updateCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
