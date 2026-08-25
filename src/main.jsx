import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CONFIG } from './config';
import './styles.css';

const CHARACTERS = '01010101ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*<>/{}[]';
const PARTICLE_COLORS = ['#ffffff', '#e7ddff', '#c9b7ff', '#a98cff'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

class LetterEngine {
  constructor(canvas, config, onPhaseChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.config = config;
    this.onPhaseChange = onPhaseChange;
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.phase = 'intro';
    this.sceneIndex = -1;
    this.sceneStartedAt = performance.now();
    this.lastFrame = this.sceneStartedAt;
    this.hidden = document.hidden;
    this.particles = [];
    this.bursts = [];
    this.frameId = 0;
    this.resize();
  }

  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const oldWidth = this.width || rect.width;
    const oldHeight = this.height || rect.height;
    this.width = Math.max(320, rect.width);
    this.height = Math.max(480, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seedRain();

    if (this.phase === 'reveal' && this.sceneIndex >= 0) {
      const elapsed = performance.now() - this.sceneStartedAt;
      this.createTextParticles(this.config.revealTexts[this.sceneIndex]);
      this.sceneStartedAt = performance.now() - elapsed;
    } else if (this.particles.length) {
      const scaleX = this.width / oldWidth;
      const scaleY = this.height / oldHeight;
      this.particles.forEach((particle) => {
        particle.x *= scaleX;
        particle.y *= scaleY;
      });
    }
  };

  seedRain() {
    this.rainFontSize = clamp(Math.round(this.width / 32), 11, 17);
    const columns = Math.ceil(this.width / this.rainFontSize);
    this.rain = Array.from({ length: columns }, (_, index) => ({
      x: index * this.rainFontSize,
      y: Math.random() * this.height,
      speed: this.reduceMotion ? 0 : 0.55 + Math.random() * 1.55,
      length: 4 + Math.floor(Math.random() * 11),
      offset: Math.floor(Math.random() * CHARACTERS.length),
    }));
  }

  randomCharacter(seed = 0) {
    const index = Math.floor(Math.random() * CHARACTERS.length + seed) % CHARACTERS.length;
    return CHARACTERS[index];
  }

  setPhase(phase) {
    this.phase = phase;
    this.sceneStartedAt = performance.now();
    this.onPhaseChange(phase);
  }

  startReveal(index) {
    if (index >= this.config.revealTexts.length) {
      this.particles = [];
      this.setPhase('final');
      return;
    }

    this.sceneIndex = index;
    this.createTextParticles(this.config.revealTexts[index]);
    this.setPhase('reveal');
  }

  createTextParticles(text) {
    const sampleCanvas = document.createElement('canvas');
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    sampleCanvas.width = Math.round(this.width);
    sampleCanvas.height = Math.round(this.height);

    const lines = text.split('\n');
    const maxTextWidth = this.width * (this.width < 540 ? 0.84 : 0.74);
    let fontSize = clamp(this.width * 0.15, 48, 138);
    const fontFamily = 'Arial Black, Arial, sans-serif';

    do {
      sampleContext.font = `900 ${fontSize}px ${fontFamily}`;
      fontSize -= 2;
    } while (
      fontSize > 34 &&
      lines.some((line) => sampleContext.measureText(line).width > maxTextWidth)
    );

    fontSize += 2;
    const lineHeight = fontSize * 1.08;
    const blockHeight = lineHeight * lines.length;
    sampleContext.clearRect(0, 0, sampleCanvas.width, sampleCanvas.height);
    sampleContext.fillStyle = '#ffffff';
    sampleContext.font = `900 ${fontSize}px ${fontFamily}`;
    sampleContext.textAlign = 'center';
    sampleContext.textBaseline = 'middle';

    lines.forEach((line, index) => {
      const y = this.height / 2 - blockHeight / 2 + lineHeight * (index + 0.5);
      sampleContext.fillText(line, this.width / 2, y);
    });

    const pixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    const gap = this.reduceMotion ? 7 : this.width < 540 ? 4 : 5;
    const targets = [];

    for (let y = 0; y < sampleCanvas.height; y += gap) {
      for (let x = 0; x < sampleCanvas.width; x += gap) {
        if (pixels[(y * sampleCanvas.width + x) * 4 + 3] > 110) {
          targets.push({ x, y });
        }
      }
    }

    const maxParticles = this.reduceMotion
      ? 360
      : Math.round(clamp((this.width * this.height) / 440, 720, 1900));
    const step = Math.max(1, Math.ceil(targets.length / maxParticles));
    this.particles = targets.filter((_, index) => index % step === 0).map((target) => {
      const side = Math.floor(Math.random() * 4);
      const spawn = [
        { x: Math.random() * this.width, y: -30 },
        { x: this.width + 30, y: Math.random() * this.height },
        { x: Math.random() * this.width, y: this.height + 30 },
        { x: -30, y: Math.random() * this.height },
      ][side];
      const angle = Math.random() * Math.PI * 2;

      return {
        x: this.reduceMotion ? target.x : spawn.x,
        y: this.reduceMotion ? target.y : spawn.y,
        tx: target.x,
        ty: target.y,
        vx: Math.cos(angle) * (0.8 + Math.random() * 2.6),
        vy: Math.sin(angle) * (0.8 + Math.random() * 2.6),
        size: 1 + Math.random() * 1.6,
        alpha: this.reduceMotion ? 1 : 0,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      };
    });
  }

  accelerate() {
    const now = performance.now();
    if (this.phase === 'intro') {
      this.sceneStartedAt = Math.min(this.sceneStartedAt, now - 3600);
    } else if (this.phase === 'reveal') {
      this.sceneStartedAt -= 900;
    }
  }

  celebrate(x = this.width / 2, y = this.height * 0.72) {
    const colors = ['#ffffff', '#f5a6c5', '#df79b3', '#c8b5ff'];
    const amount = this.reduceMotion ? 24 : 110;
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 5;
      this.bursts.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.8,
        life: 1,
        size: 1.5 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  drawRain(delta) {
    const density = this.phase === 'final' ? 0.34 : 1;
    this.ctx.font = `${this.rainFontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    this.rain.forEach((drop, columnIndex) => {
      for (let trail = 0; trail < drop.length; trail += 1) {
        if (Math.random() > density) continue;
        const y = drop.y - trail * this.rainFontSize;
        if (y < -this.rainFontSize || y > this.height + this.rainFontSize) continue;
        const strength = 1 - trail / drop.length;
        const alpha = (this.phase === 'final' ? 0.11 : 0.12 + strength * 0.34);
        this.ctx.fillStyle = trail === 0
          ? `rgba(245, 241, 255, ${alpha + 0.18})`
          : `rgba(170, 139, 255, ${alpha})`;
        this.ctx.fillText(
          this.randomCharacter(drop.offset + trail + columnIndex),
          drop.x,
          y,
        );
      }

      drop.y += drop.speed * delta * this.rainFontSize * 0.12;
      if (drop.y - drop.length * this.rainFontSize > this.height) {
        drop.y = -Math.random() * this.height * 0.55;
        drop.speed = this.reduceMotion ? 0 : 0.55 + Math.random() * 1.55;
      }
    });
  }

  drawIntro(elapsed) {
    const lineDuration = 1250;
    const lineIndex = Math.min(
      this.config.introLines.length - 1,
      Math.floor(elapsed / lineDuration),
    );
    const progress = (elapsed % lineDuration) / lineDuration;
    const alpha = Math.min(1, progress * 5, (1 - progress) * 5);
    const text = this.config.introLines[lineIndex];

    this.ctx.save();
    this.ctx.font = `600 ${clamp(this.width * 0.028, 11, 16)}px ui-monospace, Consolas, monospace`;
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = `rgba(222, 210, 255, ${alpha * 0.92})`;
    this.ctx.fillText(text, this.width / 2, this.height / 2);
    this.ctx.fillStyle = 'rgba(172, 139, 255, 0.55)';
    this.ctx.fillRect(this.width * 0.22, this.height / 2 + 27, this.width * 0.56, 1);
    this.ctx.fillStyle = 'rgba(235, 228, 255, 0.9)';
    this.ctx.fillRect(
      this.width * 0.22,
      this.height / 2 + 26,
      this.width * 0.56 * clamp(elapsed / 3900, 0, 1),
      2,
    );
    this.ctx.restore();
  }

  drawTextParticles(elapsed, delta) {
    const gatherDuration = this.reduceMotion ? 400 : 1550;
    const holdDuration = this.reduceMotion ? 2200 : 1950;
    const dissolveDuration = this.reduceMotion ? 400 : 1100;
    const dissolveAt = gatherDuration + holdDuration;

    this.particles.forEach((particle) => {
      let drawX = particle.x;
      let drawY = particle.y;

      if (elapsed < gatherDuration) {
        const pull = this.reduceMotion ? 1 : 0.055 + (elapsed / gatherDuration) * 0.13;
        particle.x += (particle.tx - particle.x) * pull * delta;
        particle.y += (particle.ty - particle.y) * pull * delta;
        particle.alpha = clamp(elapsed / (gatherDuration * 0.55), 0, 1);
      } else if (elapsed < dissolveAt) {
        particle.x += (particle.tx - particle.x) * 0.2 * delta;
        particle.y += (particle.ty - particle.y) * 0.2 * delta;
        const glitch = Math.random() < 0.025 ? (Math.random() - 0.5) * 14 : 0;
        drawX = particle.x + glitch;
        drawY = particle.y + (Math.random() - 0.5) * 0.7;
        particle.alpha = 0.82 + Math.random() * 0.18;
      } else {
        const dissolveProgress = clamp((elapsed - dissolveAt) / dissolveDuration, 0, 1);
        particle.x += particle.vx * delta * (1 + dissolveProgress * 2.8);
        particle.y += particle.vy * delta * (1 + dissolveProgress * 2.8);
        particle.alpha = 1 - dissolveProgress;
      }

      this.ctx.globalAlpha = particle.alpha;
      this.ctx.fillStyle = particle.color;
      this.ctx.fillRect(drawX, drawY, particle.size, particle.size);
    });
    this.ctx.globalAlpha = 1;

    if (!this.reduceMotion && elapsed > gatherDuration && elapsed < dissolveAt) {
      const scanY = this.height * (0.35 + ((elapsed * 0.00018) % 0.3));
      this.ctx.fillStyle = 'rgba(230, 220, 255, 0.13)';
      this.ctx.fillRect(0, scanY, this.width, 1);
    }

    if (elapsed >= dissolveAt + dissolveDuration) {
      this.startReveal(this.sceneIndex + 1);
    }
  }

  drawBursts(delta) {
    this.bursts = this.bursts.filter((particle) => particle.life > 0.02);
    this.bursts.forEach((particle) => {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 0.055 * delta;
      particle.vx *= 0.992;
      particle.life *= 0.972;
      this.ctx.globalAlpha = particle.life;
      this.ctx.fillStyle = particle.color;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.globalAlpha = 1;
  }

  drawNoise() {
    const amount = this.reduceMotion ? 18 : 75;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    for (let index = 0; index < amount; index += 1) {
      this.ctx.fillRect(Math.random() * this.width, Math.random() * this.height, 1, 1);
    }
  }

  frame = (time) => {
    this.frameId = requestAnimationFrame(this.frame);
    if (this.hidden) {
      this.lastFrame = time;
      return;
    }

    const delta = clamp((time - this.lastFrame) / 16.67, 0.25, 2.2);
    const elapsed = time - this.sceneStartedAt;
    this.lastFrame = time;

    this.ctx.fillStyle = '#020204';
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.drawRain(delta);

    if (this.phase === 'intro') {
      this.drawIntro(elapsed);
      if (elapsed >= 3900) this.startReveal(0);
    } else if (this.phase === 'reveal') {
      this.drawTextParticles(elapsed, delta);
    }

    this.drawBursts(delta);
    this.drawNoise();
  };

  start() {
    this.frameId = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
  }

  setHidden = () => {
    this.hidden = document.hidden;
    this.lastFrame = performance.now();
  };
}

function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const audioRef = useRef(null);
  const [phase, setPhase] = useState('intro');
  const [accepted, setAccepted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);

  useEffect(() => {
    const engine = new LetterEngine(canvasRef.current, CONFIG, setPhase);
    engineRef.current = engine;
    engine.start();
    window.addEventListener('resize', engine.resize);
    document.addEventListener('visibilitychange', engine.setHidden);

    return () => {
      engine.stop();
      window.removeEventListener('resize', engine.resize);
      document.removeEventListener('visibilitychange', engine.setHidden);
    };
  }, []);

  const handleFinalAnswer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    engineRef.current?.celebrate(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setAccepted(true);
  };

  const toggleAudio = async () => {
    if (!audioRef.current) return;
    if (audioEnabled) {
      audioRef.current.pause();
      setAudioEnabled(false);
      return;
    }

    try {
      await audioRef.current.play();
      setAudioEnabled(true);
    } catch {
      setAudioEnabled(false);
    }
  };

  return (
    <main
      className={`experience experience--${phase}`}
      onPointerDown={() => engineRef.current?.accelerate()}
    >
      <canvas ref={canvasRef} className="matrix-canvas" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <div className="edge-vignette" aria-hidden="true" />

      <header className="system-hud" aria-hidden="true">
        <span>QR://LOVE_LETTER</span>
        <span className="system-hud__status">{phase.toUpperCase()}</span>
      </header>

      <p className={`tap-hint ${phase === 'final' ? 'tap-hint--hidden' : ''}`}>
        CHẠM ĐỂ TUA NHANH
      </p>

      <section className={`final-message ${phase === 'final' ? 'final-message--visible' : ''}`}>
        <p className="final-message__eyebrow">{CONFIG.finalEyebrow}</p>
        <h1>{accepted ? CONFIG.acceptedMessage : CONFIG.finalTitle}</h1>
        {!accepted && (
          <>
            <p className="final-message__copy">{CONFIG.finalMessage}</p>
            <p className="final-message__question">{CONFIG.finalQuestion}</p>
            <button
              className="answer-button"
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={handleFinalAnswer}
            >
              <span aria-hidden="true">♡</span>
              {CONFIG.finalButton}
            </button>
          </>
        )}
      </section>

      {CONFIG.audioSrc && (
        <>
          <audio ref={audioRef} src={CONFIG.audioSrc} loop preload="none" />
          <button
            className="audio-toggle"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={toggleAudio}
            aria-label={audioEnabled ? 'Tắt nhạc' : 'Bật nhạc'}
          >
            {audioEnabled ? 'Ⅱ' : '♪'}
          </button>
        </>
      )}

      <p className="sr-only" aria-live="polite">
        {phase === 'final'
          ? `${CONFIG.finalTitle}. ${CONFIG.finalMessage} ${CONFIG.finalQuestion}`
          : CONFIG.revealTexts[Math.max(0, engineRef.current?.sceneIndex ?? 0)]}
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
