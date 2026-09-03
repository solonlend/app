import { useCallback, useEffect, useRef, useState } from "react";

// Same ascii-rain effect as the solonlend.xyz hero — replaces the Morpho CDN videos.
const ASCII_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=-~^";

function useAsciiFrame(rows: number, cols: number) {
  const [frame, setFrame] = useState("");
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const generateFrame = useCallback(() => {
    let result = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const distFromCenter = Math.abs(c - cols / 2) / (cols / 2);
        const vertDist = Math.abs(r - rows / 2) / (rows / 2);
        const dist = Math.sqrt(distFromCenter ** 2 + vertDist ** 2);
        if (Math.random() > dist * 0.7) {
          result += ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)];
        } else {
          result += " ";
        }
      }
      if (r < rows - 1) result += "\n";
    }
    return result;
  }, [rows, cols]);

  useEffect(() => {
    const animate = (time: number) => {
      if (time - lastTimeRef.current > 120) {
        lastTimeRef.current = time;
        setFrame(generateFrame());
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [generateFrame]);

  return frame;
}

// Mirrors the solonlend.xyz hero: the rain is a full-bleed centered background layer,
// with the heading overlaid on top — not a text/art split.
export function CtaCard({
  className,
  bigText,
  littleText,
}: {
  className: string;
  bigText: string;
  littleText: string;
}) {
  const frame = useAsciiFrame(30, 80);
  return (
    <div className={className}>
      <div className="relative flex min-h-[420px] w-full items-center justify-center overflow-hidden">
        {/* Same recipe as the homepage hero: 30x80 frame, centered, opacity 0.10 — the generator's
            radial density falloff gives the soft edges. */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden opacity-[0.10]"
          aria-hidden="true"
        >
          <pre className="text-foreground select-none whitespace-pre font-mono text-sm leading-[18px] lg:text-base lg:leading-[22px]">
            {frame}
          </pre>
        </div>
        <div className="relative z-10 flex w-full max-w-6xl flex-col gap-5 px-4 md:px-10">
          <h1 className="font-pixel max-w-2xl text-4xl leading-tight tracking-wide md:text-5xl">{bigText}</h1>
          <h2 className="text-secondary-foreground font-light">{littleText}</h2>
        </div>
      </div>
    </div>
  );
}
