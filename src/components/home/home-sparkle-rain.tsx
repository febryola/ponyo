"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  radius: number;
  isStar: boolean;
  isStreak: boolean;
  color: string;
  speed: number;
  sway: number;
  phase: number;
  spin: number;
  angle: number;
  alpha: number;
  twinkle: number;
};

const colors = ["#f6c453", "#f6c453", "#f4a6b4", "#a9c8e6", "#ee8a4c", "#ffffff"];

export function HomeSparkleRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    const particles: Particle[] = [];
    let frameId = 0;
    let previousTime = 0;
    let lastDrawTime = 0;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const particleCount = isMobile ? 86 : 148;
    const frameInterval = isMobile ? 1000 / 30 : 1000 / 45;

    const makeParticle = (fromTop: boolean): Particle => {
      const isStreak = Math.random() < 0.075;
      const isStar = !isStreak && Math.random() < 0.38;
      return {
        x: Math.random() * width,
        y: fromTop ? -20 - Math.random() * height * 0.3 : Math.random() * height,
        radius: isStreak ? 5 + Math.random() * 8 : isStar ? 2.4 + Math.random() * 3.8 : 1.1 + Math.random() * 2.4,
        isStar,
        isStreak,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: isStreak ? 38 + Math.random() * 35 : 16 + Math.random() * 38,
        sway: 8 + Math.random() * 25,
        phase: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 1.6,
        angle: Math.random() * Math.PI,
        alpha: 0.45 + Math.random() * 0.45,
        twinkle: 1.5 + Math.random() * 2.5,
      };
    };

    const resize = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      while (particles.length < particleCount) particles.push(makeParticle(false));
      particles.length = particleCount;
    };

    const drawParticle = (particle: Particle, time: number) => {
      context.save();
      context.translate(particle.x, particle.y);
      context.globalAlpha = particle.alpha;
      context.fillStyle = particle.color;

      if (particle.isStreak) {
        context.rotate(particle.angle + Math.PI / 4);
        context.globalAlpha *= 0.75;
        context.strokeStyle = particle.color;
        context.lineWidth = Math.max(1, particle.radius * 0.22);
        context.lineCap = "round";
        context.shadowColor = particle.color;
        context.shadowBlur = particle.radius * 1.6;
        context.beginPath();
        context.moveTo(-particle.radius * 2.8, 0);
        context.lineTo(particle.radius * 2.8, 0);
        context.stroke();
      } else if (particle.isStar) {
        context.rotate(particle.angle);
        context.globalAlpha *= 0.5 + 0.5 * Math.sin(time * particle.twinkle + particle.phase);
        context.shadowColor = particle.color;
        context.shadowBlur = particle.radius * 1.3;
        context.beginPath();
        for (let point = 0; point < 8; point += 1) {
          const angle = point * Math.PI / 4 - Math.PI / 2;
          const radius = point % 2 === 0 ? particle.radius : particle.radius * 0.2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (point === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
      } else {
        context.shadowColor = particle.color === "#ffffff" ? "rgba(169, 200, 230, .9)" : "transparent";
        context.shadowBlur = particle.color === "#ffffff" ? 4 : 0;
        context.beginPath();
        context.arc(0, 0, particle.radius, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    };

    const stop = () => {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
      context.clearRect(0, 0, width, height);
    };

    const animate = (now: number) => {
      if (now - lastDrawTime < frameInterval) {
        frameId = window.requestAnimationFrame(animate);
        return;
      }
      lastDrawTime = now;
      const delta = Math.min(0.05, (now - (previousTime || now)) / 1000);
      previousTime = now;
      const time = now / 1000;
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.y += particle.speed * delta;
        particle.x += Math.sin(time * 0.8 + particle.phase) * particle.sway * delta;
        particle.angle += particle.spin * delta;
        if (particle.y > height + 20) Object.assign(particle, makeParticle(true));
        drawParticle(particle, time);
      }

      frameId = window.requestAnimationFrame(animate);
    };

    const start = () => {
      if (!frameId) {
        previousTime = 0;
        lastDrawTime = 0;
        frameId = window.requestAnimationFrame(animate);
      }
    };

    const updateVisibility = () => {
      const marker = document.querySelector<HTMLElement>("[data-sparkle-end]");
      const end = marker ? marker.getBoundingClientRect().top + window.scrollY : height;
      const fadeFrom = end * 0.45;
      const scrollY = window.scrollY;
      const opacity = scrollY <= fadeFrom ? 1 : Math.max(0, 1 - (scrollY - fadeFrom) / Math.max(1, end - fadeFrom));
      canvas.style.opacity = String(opacity);

      if (opacity === 0 || document.hidden) stop();
      else start();
    };

    const handleResize = () => {
      resize();
      updateVisibility();
    };

    resize();
    canvas.style.opacity = "1";
    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("scroll", updateVisibility, { passive: true });
    document.addEventListener("visibilitychange", updateVisibility);
    updateVisibility();

    return () => {
      stop();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", updateVisibility);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="home-sparkle-rain" aria-hidden="true" />;
}
