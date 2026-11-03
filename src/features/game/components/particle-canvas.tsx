"use client";

import { useEffect, useRef } from "react";
import type { MotionLevel } from "@/config/app.config";
import { PARTICLES } from "@/config/game.config";

export type ParticleMode = "drift" | "inward" | "burst";

type Particle = { x: number; y: number; vx: number; vy: number; size: number; life: number; maxLife: number };

const MOBILE_WIDTH = 768;
const MAX_PIXEL_RATIO = 1.5;

function spawn(mode: ParticleMode, width: number, height: number): Particle {
  const maxLife = 180 + Math.random() * 240;
  const size = 0.6 + Math.random() * 1.8;

  if (mode === "burst") {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 5;
    return {
      x: width / 2,
      y: height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: size + 0.6,
      life: 0,
      maxLife: 60 + Math.random() * 90,
    };
  }

  if (mode === "inward") {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(width, height) * 0.6;
    const x = width / 2 + Math.cos(angle) * radius;
    const y = height / 2 + Math.sin(angle) * radius;
    const speed = 0.25 + Math.random() * 0.45;
    return { x, y, vx: -Math.cos(angle) * speed, vy: -Math.sin(angle) * speed, size, life: 0, maxLife: maxLife * 2 };
  }

  return {
    x: Math.random() * width,
    y: height + Math.random() * 20,
    vx: (Math.random() - 0.5) * 0.25,
    vy: -(0.2 + Math.random() * 0.5),
    size,
    life: 0,
    maxLife,
  };
}

/**
 * Embers. Fewer on phones, nothing at all when motion is reduced or off, and paused while the tab is hidden.
 * It's purely decorative, so it stays out of the accessibility tree and never takes a click.
 */
export function ParticleCanvas(props: {
  mode: ParticleMode;
  color: string;
  motion: MotionLevel;
  /** From 0 to 1, for example lower when Power is low. */
  intensity?: number;
  speed?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { mode, color, motion, intensity = 1, speed = 1 } = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || motion !== "full") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const isMobile = window.innerWidth < MOBILE_WIDTH;
    const count = Math.round(PARTICLES.desktop * intensity * (isMobile ? PARTICLES.mobileFactor : 1));
    if (count === 0) return;

    let width = 0;
    let height = 0;
    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = width * ratio;
      canvas!.height = height * ratio;
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const particles = Array.from({ length: count }, () => {
      const particle = spawn(mode, width, height);
      if (mode === "drift") particle.y = Math.random() * height;
      particle.life = mode === "burst" ? 0 : Math.random() * particle.maxLife;
      return particle;
    });

    let frame = 0;
    function draw() {
      context!.clearRect(0, 0, width, height);
      context!.fillStyle = color;
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i];
        particle.x += particle.vx * speed;
        particle.y += particle.vy * speed;
        particle.life += speed;

        if (particle.life >= particle.maxLife) {
          if (mode === "burst") continue;
          particles[i] = spawn(mode, width, height);
          continue;
        }

        const fade = 1 - particle.life / particle.maxLife;
        context!.globalAlpha = Math.max(0, Math.min(1, fade * 0.9));
        context!.beginPath();
        context!.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context!.fill();
      }
      context!.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    }

    function onVisibility() {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode, color, motion, intensity, speed]);

  return <canvas ref={canvasRef} aria-hidden="true" className={props.className} />;
}
