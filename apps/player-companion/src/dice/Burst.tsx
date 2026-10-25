import React, { useEffect, useRef, useState } from "react";
import { DiceAnimationProps, dieFacets, dieOutline, svgPoints } from "./common";

// The die shakes harder and harder, flashes, and bursts into sparks that reveal the
// number. CSS keyframes for the shake, a short-lived canvas 2D particle burst.

const SHAKE_MS = 900;
const SPARKS_MS = 900;

export function DieIcon({ sides, value, className }: { sides: number; value?: string | number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`die-gold-${sides}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1cf83" />
          <stop offset="1" stopColor="#a8782f" />
        </linearGradient>
      </defs>
      <polygon points={svgPoints(dieOutline(sides), 44)} fill={`url(#die-gold-${sides})`} stroke="#2a1a08" strokeWidth="2.5" strokeLinejoin="round" />
      {dieFacets(sides).map(([a, b], i) => (
        <line key={i} x1={50 + a[0] * 44} y1={50 + a[1] * 44} x2={50 + b[0] * 44} y2={50 + b[1] * 44} stroke="rgba(60,36,10,0.45)" strokeWidth="1.4" />
      ))}
      {value !== undefined ? (
        <text x="50" y={sides === 4 ? 60 : 53} textAnchor="middle" dominantBaseline="middle" className="die-icon-text" fontSize={String(value).length > 2 ? 24 : 32}>
          {value}
        </text>
      ) : null}
    </svg>
  );
}

function sparks(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const scale = Math.min(rect.width, rect.height);
  const particles = Array.from({ length: 56 }, () => {
    const a = Math.random() * Math.PI * 2;
    const speed = scale * (0.6 + Math.random() * 1.4);
    return { x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: 1.5 + Math.random() * 3, hue: 38 + Math.random() * 14 };
  });
  const start = performance.now();
  let last = start;
  let frame = 0;
  function tick(now: number) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    const t = (now - start) / SPARKS_MS;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, rect.width, rect.height);
    if (t >= 1) return;
    ctx!.globalCompositeOperation = "lighter";
    for (const p of particles) {
      p.vx *= Math.pow(0.08, dt);
      p.vy = p.vy * Math.pow(0.08, dt) + scale * 0.9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx!.fillStyle = `hsla(${p.hue}, 90%, 65%, ${1 - t})`;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
      ctx!.fill();
    }
    ctx!.globalCompositeOperation = "source-over";
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

export function Burst({ faces, thrown, onSettled, compact }: DiceAnimationProps) {
  const [phase, setPhase] = useState<"idle" | "shake" | "reveal">("idle");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!thrown) return;
    setPhase("shake");
    let stopSparks = () => {};
    const reveal = window.setTimeout(() => {
      setPhase("reveal");
      if (canvasRef.current) stopSparks = sparks(canvasRef.current);
    }, SHAKE_MS);
    const done = window.setTimeout(onSettled, SHAKE_MS + 450);
    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(done);
      stopSparks();
    };
  }, [thrown]);

  const many = faces.values.length > 1;
  const total = faces.values.reduce((a, b) => a + b, 0);

  return (
    <div className={`burst ${compact ? "compact" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="dice-anim-canvas" />
      {phase !== "reveal" ? (
        <div className={`burst-die ${phase}`}>
          <DieIcon sides={faces.sides} />
        </div>
      ) : (
        <div className="burst-reveal">
          <span className="burst-number">{many ? total : faces.values[0]}</span>
          {many ? <span className="burst-parts">{faces.values.join(" + ")}</span> : null}
        </div>
      )}
    </div>
  );
}
