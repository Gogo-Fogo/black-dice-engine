import React, { useEffect, useRef } from "react";
import { DiceAnimationProps, dieFacets, dieOutline, randomFace } from "./common";

// Top-down 2D physics on a canvas: dice fly in, bounce off the screen edges, spin down
// and settle upright on their result. No WebGL; one canvas, one rAF loop.

type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  shown: number;
  final: number;
  nextFlip: number;
  settledAt: number | null;
};

const GOLD_TOP = "#f1cf83";
const GOLD_BOTTOM = "#a8782f";

function drawDie(ctx: CanvasRenderingContext2D, sides: number, r: number, value: number, glow: number) {
  const outline = dieOutline(sides);
  ctx.beginPath();
  outline.forEach(([x, y], i) => (i ? ctx.lineTo(x * r, y * r) : ctx.moveTo(x * r, y * r)));
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, -r, 0, r);
  fill.addColorStop(0, GOLD_TOP);
  fill.addColorStop(1, GOLD_BOTTOM);
  ctx.fillStyle = fill;
  if (glow > 0) {
    ctx.shadowColor = `rgba(255, 214, 120, ${0.8 * glow})`;
    ctx.shadowBlur = r * 0.8 * glow;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.5, r * 0.05);
  ctx.strokeStyle = "rgba(40, 24, 6, 0.85)";
  ctx.stroke();

  ctx.beginPath();
  for (const [[ax, ay], [bx, by]] of dieFacets(sides)) {
    ctx.moveTo(ax * r, ay * r);
    ctx.lineTo(bx * r, by * r);
  }
  ctx.lineWidth = Math.max(1, r * 0.025);
  ctx.strokeStyle = "rgba(60, 36, 10, 0.45)";
  ctx.stroke();

  ctx.fillStyle = "#24170a";
  const label = String(value);
  ctx.font = `800 ${Math.round(r * (label.length > 2 ? 0.5 : label.length > 1 ? 0.62 : 0.72))}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, sides === 4 ? r * 0.18 : r * 0.04);
}

export function Tumble({ faces, thrown, onSettled, compact }: DiceAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thrownRef = useRef(thrown);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => {
    thrownRef.current = thrown;
  }, [thrown]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      settledRef.current();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    const count = faces.values.length;
    const r = Math.min(w, h) * (compact ? 0.13 : 0.12) * (count > 2 ? 0.8 : 1);
    const bodies: Body[] = faces.values.map((final, i) => ({
      x: w / 2 + (i - (count - 1) / 2) * r * 2.4,
      y: h * 0.72,
      vx: 0,
      vy: 0,
      angle: (Math.random() - 0.5) * 0.4,
      spin: 0,
      shown: randomFace(faces.sides),
      final,
      nextFlip: 0,
      settledAt: null
    }));

    let launched = false;
    let launchTime = 0;
    let doneFired = false;
    let doneAt = 0;
    let last = performance.now();
    let frame = 0;

    function launch(now: number) {
      launched = true;
      launchTime = now;
      bodies.forEach((b, i) => {
        b.x = w * (0.3 + 0.4 * Math.random()) + (i - (count - 1) / 2) * r;
        b.y = h + r * 1.2;
        const speed = h * (2.3 + Math.random() * 0.6);
        const dir = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
        b.vx = Math.cos(dir) * speed;
        b.vy = Math.sin(dir) * speed;
        b.spin = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10);
      });
    }

    function step(now: number) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!launched && thrownRef.current) launch(now);

      for (const b of bodies) {
        if (!launched) {
          // idle: a gentle wobble while waiting for the throw
          b.angle = Math.sin(now / 420 + b.final) * 0.12;
          continue;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.angle += b.spin * dt;
        const friction = Math.pow(0.18, dt); // strong table friction
        b.vx *= friction;
        b.vy *= friction;
        b.spin *= Math.pow(0.12, dt);

        // bounce off the edges (only once the die has entered from below)
        const entered = now - launchTime > 120;
        if (b.x < r) (b.x = r), (b.vx = Math.abs(b.vx) * 0.6), (b.spin *= -0.8);
        if (b.x > w - r) (b.x = w - r), (b.vx = -Math.abs(b.vx) * 0.6), (b.spin *= -0.8);
        if (b.y < r) (b.y = r), (b.vy = Math.abs(b.vy) * 0.6), (b.spin *= -0.8);
        if (entered && b.y > h - r) (b.y = h - r), (b.vy = -Math.abs(b.vy) * 0.6);

        const speed = Math.hypot(b.vx, b.vy) + Math.abs(b.spin) * r;
        if (speed > r * 2.5 && now > b.nextFlip) {
          b.shown = randomFace(faces.sides);
          b.nextFlip = now + 60 + (1 - Math.min(1, speed / (h * 2))) * 140;
        }
        if (speed < r * 2.5 || now - launchTime > 1500) {
          b.shown = b.final;
          if (b.settledAt === null) b.settledAt = now;
          // ease the die upright and to a stop
          b.angle += (Math.round(b.angle / (Math.PI * 2)) * Math.PI * 2 - b.angle) * Math.min(1, dt * 8);
          b.vx *= 0.8;
          b.vy *= 0.8;
          b.spin *= 0.8;
        }
      }

      // keep dice from overlapping
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          const min = r * 2.05;
          if (dist < min) {
            const push = (min - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const tvx = a.vx;
            const tvy = a.vy;
            a.vx = b.vx * 0.8;
            a.vy = b.vy * 0.8;
            b.vx = tvx * 0.8;
            b.vy = tvy * 0.8;
          }
        }
      }

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      for (const b of bodies) {
        const glow = b.settledAt !== null ? Math.min(1, (now - b.settledAt) / 400) : 0;
        // soft shadow
        ctx!.save();
        ctx!.translate(b.x + r * 0.12, b.y + r * 0.22);
        ctx!.scale(1, 0.55);
        ctx!.beginPath();
        ctx!.arc(0, 0, r * 0.95, 0, Math.PI * 2);
        ctx!.fillStyle = "rgba(0,0,0,0.35)";
        ctx!.fill();
        ctx!.restore();

        ctx!.save();
        ctx!.translate(b.x, b.y);
        ctx!.rotate(b.angle);
        drawDie(ctx!, faces.sides, r, b.shown, glow);
        ctx!.restore();
      }

      const allSettled = launched && bodies.every((b) => b.settledAt !== null && now - b.settledAt > 350);
      if (allSettled && !doneFired) {
        doneFired = true;
        doneAt = now;
        settledRef.current();
      }
      // Stop drawing once the glow has finished; nothing moves after that.
      if (doneFired && now - doneAt > 600) return;
      frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [faces.sides, faces.values.join(","), compact]);

  return <canvas ref={canvasRef} className="dice-anim-canvas" aria-hidden="true" />;
}
