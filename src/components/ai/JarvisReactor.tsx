import React, { useEffect, useRef } from 'react';
import { JarvisState } from '../../../shared/jarvisTypes';

interface JarvisReactorProps {
  state?: JarvisState;
  size?: 'mini' | 'medium' | 'large';
  onClick?: () => void;
  className?: string;
  isAudioActive?: boolean;
}

export const JarvisReactor: React.FC<JarvisReactorProps> = ({
  state = 'idle',
  size = 'medium',
  onClick,
  className = '',
  isAudioActive = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const dimension = size === 'mini' ? 56 : size === 'large' ? 180 : 100;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let angle = 0;
    let pulse = 0;

    const render = () => {
      ctx.clearRect(0, 0, dimension, dimension);
      const centerX = dimension / 2;
      const centerY = dimension / 2;
      const radius = dimension * 0.42;

      pulse += 0.04;
      const pulseFactor = 0.96 + Math.sin(pulse) * 0.05;

      let primaryColor = '0, 242, 254'; // Cyan default
      let coreColor = '224, 242, 254';

      if (state === 'listening') {
        primaryColor = '56, 239, 125'; // Emerald green/cyan
        angle += 0.05;
      } else if (state === 'thinking') {
        primaryColor = '168, 85, 247'; // Electric purple / neon violet
        coreColor = '250, 232, 255'; // Radiant hyper core
        angle += 0.09;
        pulse += 0.06;
      } else if (state === 'speaking') {
        primaryColor = '0, 198, 255'; // Intense laser blue
        angle += isAudioActive ? 0.06 : 0.03;
      } else if (state === 'alert') {
        primaryColor = '255, 75, 43'; // Stark red
        angle += 0.1;
      } else {
        angle += 0.015;
      }

      // 1. 最外层微光光晕 (Outer Aura)
      const auraGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.2,
        centerX,
        centerY,
        radius * 1.15
      );
      auraGradient.addColorStop(0, `rgba(${primaryColor}, 0.35)`);
      auraGradient.addColorStop(0.7, `rgba(${primaryColor}, 0.1)`);
      auraGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = auraGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.15, 0, Math.PI * 2);
      ctx.fill();

      // 2. 外部机械刻度圆环 (Outer Ring with Ticks)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);

      ctx.strokeStyle = `rgba(${primaryColor}, 0.5)`;
      ctx.lineWidth = size === 'mini' ? 1.5 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius * pulseFactor, 0, Math.PI * 2);
      ctx.stroke();

      const ticks = size === 'mini' ? 8 : 16;
      for (let i = 0; i < ticks; i++) {
        const tickAngle = (i * Math.PI * 2) / ticks;
        const x1 = Math.cos(tickAngle) * (radius * pulseFactor - (size === 'mini' ? 3 : 6));
        const y1 = Math.sin(tickAngle) * (radius * pulseFactor - (size === 'mini' ? 3 : 6));
        const x2 = Math.cos(tickAngle) * (radius * pulseFactor + 2);
        const y2 = Math.sin(tickAngle) * (radius * pulseFactor + 2);

        ctx.strokeStyle = `rgba(${primaryColor}, 0.8)`;
        ctx.lineWidth = size === 'mini' ? 1.5 : 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      // 3. 中间逆向旋转齿轮环 (Counter-rotating Inner Segments)
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-angle * 1.4);

      ctx.strokeStyle = `rgba(${primaryColor}, 0.65)`;
      ctx.lineWidth = size === 'mini' ? 2 : 3;
      const segments = size === 'mini' ? 3 : 6;
      const arcLength = (Math.PI * 2) / segments;
      for (let i = 0; i < segments; i++) {
        const start = i * arcLength + 0.15;
        const end = (i + 1) * arcLength - 0.15;
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.65, start, end);
        ctx.stroke();
      }
      ctx.restore();

      // 4. 核心聚能反应堆 (Core Reactor Eye)
      const coreRadius = radius * (size === 'mini' ? 0.38 : 0.42) * pulseFactor;
      const coreGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        coreRadius
      );
      coreGradient.addColorStop(0, `rgba(${coreColor}, 1)`);
      coreGradient.addColorStop(0.5, `rgba(${primaryColor}, 0.9)`);
      coreGradient.addColorStop(1, `rgba(${primaryColor}, 0.3)`);

      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // 5. 核心高光小十字准星
      if (size !== 'mini') {
        ctx.strokeStyle = `rgba(${coreColor}, 0.9)`;
        ctx.lineWidth = 1.5;
        const cross = 6;
        ctx.beginPath();
        ctx.moveTo(centerX - cross, centerY);
        ctx.lineTo(centerX + cross, centerY);
        ctx.moveTo(centerX, centerY - cross);
        ctx.lineTo(centerX, centerY + cross);
        ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [state, size, dimension, isAudioActive]);

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center cursor-pointer select-none transition-transform active:scale-95 ${className}`}
      style={{ width: dimension, height: dimension }}
      title={
        state === 'listening'
          ? '正在倾听您的指令...'
          : state === 'thinking'
          ? '贾维斯正在深度推理...'
          : state === 'speaking'
          ? '贾维斯正在语音播报...'
          : state === 'alert'
          ? '生产环境安全预警'
          : '贾维斯方舟反应堆 (点击交互)'
      }
    >
      <canvas
        ref={canvasRef}
        width={dimension}
        height={dimension}
        className={`w-full h-full ${
          state === "thinking"
            ? "drop-shadow-[0_0_22px_rgba(168,85,247,0.75)] animate-pulse"
            : state === "listening"
            ? "drop-shadow-[0_0_20px_rgba(56,239,125,0.7)]"
            : "drop-shadow-[0_0_15px_rgba(0,242,254,0.35)]"
        }`}
      />
    </div>
  );
};
