import React, { useEffect, useRef } from 'react';

export type BubbleVibeMode = 'off' | 'subtle' | 'lively';

interface AmbientBubblesProps {
  mode: BubbleVibeMode;
  darkMode: boolean;
}

interface BubbleParticle {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  wobblePhase: number;
  wobbleSpeed: number;
  alpha: number;
}

export const AmbientBubbles: React.FC<AmbientBubblesProps> = ({ mode, darkMode }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -1000,
    y: -1000,
    active: false,
  });

  useEffect(() => {
    if (mode === 'off') return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const count = mode === 'lively' ? 32 : 16;
    const spawnBubble = (startAtBottom = false): BubbleParticle => {
      const r = mode === 'lively' ? 8 + Math.random() * 24 : 6 + Math.random() * 18;
      return {
        x: Math.random() * width,
        y: startAtBottom ? height + r + Math.random() * 80 : Math.random() * height,
        r,
        vy: 0.22 + (1 / Math.max(8, r)) * (mode === 'lively' ? 6.5 : 4.2),
        vx: (Math.random() - 0.5) * 0.15,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.008 + Math.random() * 0.012,
        alpha: 0.12 + Math.random() * (mode === 'lively' ? 0.2 : 0.12),
      };
    };

    const bubbles: BubbleParticle[] = Array.from({ length: count }, () => spawnBubble(false));

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handlePointerMove = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, active: true };
    };

    const handlePointerLeave = () => {
      pointerRef.current.active = false;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handlePointerMove, { passive: true });
    window.addEventListener('mouseleave', handlePointerLeave);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < bubbles.length; i += 1) {
        const b = bubbles[i];
        b.wobblePhase += b.wobbleSpeed;
        b.y -= b.vy;
        b.x += b.vx + Math.sin(b.wobblePhase) * 0.25;

        // Gentle buoyancy repulsion away from cursor for tactile realism
        if (pointerRef.current.active) {
          const dx = b.x - pointerRef.current.x;
          const dy = b.y - pointerRef.current.y;
          const dist = Math.hypot(dx, dy);
          const influence = b.r + 75;
          if (dist > 0 && dist < influence) {
            const force = ((influence - dist) / influence) * 0.45;
            b.x += (dx / dist) * force;
            b.y += (dy / dist) * force;
          }
        }

        if (b.y < -b.r * 2) {
          bubbles[i] = spawnBubble(true);
          continue;
        }
        if (b.x < -b.r * 2) b.x = width + b.r;
        if (b.x > width + b.r * 2) b.x = -b.r;

        // Soft realistic glass bubble: delicate outer rim + subtle inner gradient + specular glint
        const baseColor = darkMode ? '96, 165, 250' : '37, 99, 235';
        const rimColor = darkMode ? '226, 232, 240' : '255, 255, 255';

        const grad = ctx.createRadialGradient(
          b.x - b.r * 0.3,
          b.y - b.r * 0.3,
          b.r * 0.1,
          b.x,
          b.y,
          b.r
        );
        grad.addColorStop(0, `rgba(${rimColor}, ${b.alpha * 0.65})`);
        grad.addColorStop(0.65, `rgba(${baseColor}, ${b.alpha * 0.18})`);
        grad.addColorStop(1, `rgba(${baseColor}, ${b.alpha * 0.45})`);

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${rimColor}, ${b.alpha * 0.7})`;
        ctx.stroke();

        // Crisp specular highlight arc on top-left of bubble
        ctx.beginPath();
        ctx.arc(
          b.x - b.r * 0.32,
          b.y - b.r * 0.32,
          Math.max(1.5, b.r * 0.18),
          0,
          Math.PI * 2
        );
        ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * 1.15})`;
        ctx.fill();
      }

      animId = window.requestAnimationFrame(render);
    };

    animId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [darkMode, mode]);

  if (mode === 'off') return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
    />
  );
};
