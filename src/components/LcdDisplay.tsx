import React, { useEffect, useRef, useState } from 'react';

interface LcdDisplayProps {
  getAnalyser: () => AnalyserNode | null;
  statusText: string;
}

export const LcdDisplay: React.FC<LcdDisplayProps> = ({ getAnalyser, statusText }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<'scope' | 'fft'>('scope');

  useEffect(() => {
    let rafId = 0;
    const timeBuf = new Float32Array(1024);
    const freqBuf = new Uint8Array(512);

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.fillStyle = '#0c1412';
          ctx.fillRect(0, 0, w, h);

          // Subtle oscilloscope graticule
          ctx.strokeStyle = 'rgba(92, 242, 182, 0.08)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, h / 2);
          ctx.lineTo(w, h / 2);
          for (let x = 1; x < 8; x++) {
            const gx = (w / 8) * x;
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
          }
          ctx.stroke();

          const analyser = getAnalyser();
          if (analyser) {
            if (mode === 'scope') {
              analyser.getFloatTimeDomainData(timeBuf);
              // Zero-crossing trigger for rock-solid bass waveform display
              let trigger = 0;
              for (let i = 1; i < 512; i++) {
                if (timeBuf[i - 1] < 0 && timeBuf[i] >= 0) {
                  trigger = i;
                  break;
                }
              }

              ctx.strokeStyle = '#5cf2b6';
              ctx.lineWidth = 2;
              ctx.shadowColor = 'rgba(92, 242, 182, 0.5)';
              ctx.shadowBlur = 6;
              ctx.beginPath();
              const sliceLen = 512;
              for (let i = 0; i < sliceLen; i++) {
                const sample = timeBuf[trigger + i] ?? 0;
                const x = (i / (sliceLen - 1)) * w;
                const y = h / 2 - sample * (h * 0.42);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.stroke();
              ctx.shadowBlur = 0;
            } else {
              analyser.getByteFrequencyData(freqBuf);
              const bars = 48;
              const barW = w / bars;
              for (let i = 0; i < bars; i++) {
                // Log-ish bin spacing to emphasize UK bassline 30Hz-4kHz range
                const bin = Math.min(freqBuf.length - 1, Math.floor(Math.pow(i / bars, 1.8) * 260));
                const v = freqBuf[bin] / 255;
                const bh = v * (h - 16);
                ctx.fillStyle = v > 0.78 ? '#ff7a1f' : '#5cf2b6';
                ctx.fillRect(i * barW + 1, h - bh, barW - 2, bh);
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [getAnalyser, mode]);

  return (
    <div className="lcd-screen">
      <canvas ref={canvasRef} width={600} height={128} className="lcd-canvas" />
      <div className="lcd-overlay">
        <span>{statusText}</span>
        <button
          type="button"
          className="lcd-mode-toggle"
          onClick={() => setMode((m) => (m === 'scope' ? 'fft' : 'scope'))}
        >
          {mode === 'scope' ? 'SCOPE' : 'FFT'}
        </button>
      </div>
    </div>
  );
};
