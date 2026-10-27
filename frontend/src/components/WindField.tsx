import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "../lib/motion";
import { readToken } from "../lib/theme";

const FPS = 20;
/** Backing-store scale: half resolution. The lines are faint and soft, so the blur is invisible
 * and the per-frame pixel work drops to a quarter. */
const RENDER_SCALE = 0.5;
/** Particles per 1,000 px of width, capped (docs/design.md §6: about 60 at desktop widths). */
const DENSITY = 42;
const MAX_PARTICLES = 64;
const TRAIL_FADE = 0.045;
/** Opacity steps for batching strokes. */
const ALPHA_LEVELS = 4;

interface Particle {
  x: number;
  y: number;
  age: number;
  life: number;
  accent: boolean;
}

/** A smooth, mostly eastward flow: GB's prevailing south-westerlies, gently meandering. */
function flowAngle(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 0.0021 + t * 0.00011) * 0.55 + Math.cos(y * 0.0043 - t * 0.00007) * 0.35 - 0.12
  );
}

function spawn(w: number, h: number, anywhere: boolean): Particle {
  return {
    x: anywhere ? Math.random() * w : -10 - Math.random() * 40,
    y: Math.random() * h,
    age: 0,
    life: 160 + Math.random() * 220,
    accent: Math.random() < 0.18,
  };
}

/**
 * The signature background: faint particles drifting along a flow field, drawn on a canvas at
 * 20 fps at half resolution. It pauses when the tab is hidden or the canvas is off-screen,
 * and under reduced motion it draws one static frame of streamlines instead.
 */
export function WindField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    // jsdom has no canvas; skip quietly in tests.
    if (!canvas || /jsdom/i.test(navigator.userAgent)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let particles: Particle[] = [];
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let visible = true;
    let colour = "168 175 187";
    let accent = "143 151 255";
    const reduced = prefersReducedMotion();

    const readColours = () => {
      colour = readToken("--wind") || colour;
      const a = readToken("--accent");
      // --accent is a hex colour; convert to "r g b" for rgb(... / alpha).
      if (/^#[0-9a-f]{6}$/i.test(a)) {
        accent = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)).join(" ");
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = RENDER_SCALE;
      w = Math.max(1, Math.round(rect.width));
      h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(MAX_PARTICLES, Math.round((w / 1000) * DENSITY));
      particles = Array.from({ length: n }, () => spawn(w, h, true));
      if (reduced) drawStatic();
    };

    const step = (p: Particle, t: number) => {
      const a = flowAngle(p.x, p.y, t);
      const speed = 1.1 + Math.sin(p.y * 0.01 + t * 0.0002) * 0.35;
      const nx = p.x + Math.cos(a) * speed * 1.6;
      const ny = p.y + Math.sin(a) * speed * 0.6;
      return [nx, ny] as const;
    };

    /** Fade in and out over the particle's life, quantised so strokes can be batched. */
    const level = (p: Particle) =>
      Math.min(
        ALPHA_LEVELS - 1,
        Math.floor(Math.sin((Math.min(p.age, p.life) / p.life) * Math.PI) * ALPHA_LEVELS),
      );
    const styleFor = (isAccent: boolean, lvl: number) => {
      const k = (lvl + 1) / ALPHA_LEVELS;
      return isAccent
        ? `rgb(${accent} / ${(0.5 * k).toFixed(3)})`
        : `rgb(${colour} / ${(0.32 * k).toFixed(3)})`;
    };
    const strokeFor = (p: Particle) => styleFor(p.accent, level(p));

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const p of particles) {
        p.life = 120;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (p.age = 0; p.age < p.life; p.age += 1) {
          const [nx, ny] = step(p, 0);
          p.x = nx;
          p.y = ny;
          ctx.lineTo(p.x, p.y);
        }
        p.age = p.life / 2;
        ctx.strokeStyle = strokeFor(p);
        ctx.stroke();
      }
    };

    const frame = (now: number) => {
      // Wake only when the next frame is due: a rAF request every vsync would run the browser's
      // frame pipeline 60 times a second for 24 drawn frames.
      timer = setTimeout(() => {
        raf = requestAnimationFrame(frame);
      }, 1000 / FPS);
      // Fade old trails instead of clearing, which leaves short streaks behind each particle.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgb(0 0 0 / ${TRAIL_FADE})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      // One path per (colour, alpha level): about 8 strokes a frame instead of one per particle.
      const paths = Array.from({ length: ALPHA_LEVELS * 2 }, () => new Path2D());
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        if (!p) continue;
        const [nx, ny] = step(p, now);
        const path = paths[(p.accent ? ALPHA_LEVELS : 0) + level(p)];
        path?.moveTo(p.x, p.y);
        path?.lineTo(nx, ny);
        p.x = nx;
        p.y = ny;
        p.age += 1;
        if (p.age > p.life || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          p = spawn(w, h, false);
          particles[i] = p;
        }
      }
      paths.forEach((path, i) => {
        ctx.strokeStyle = styleFor(i >= ALPHA_LEVELS, i % ALPHA_LEVELS);
        ctx.stroke(path);
      });
    };

    const start = () => {
      if (reduced || running || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };

    readColours();
    resize();
    start();

    const ro = new ResizeObserver(() => {
      resize();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Follow theme changes (the toggle sets data-theme; the OS can switch too).
    const mo = new MutationObserver(() => {
      readColours();
      if (reduced) drawStatic();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} data-wind-field="" />;
}
