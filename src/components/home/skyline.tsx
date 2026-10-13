/**
 * Decorative city skyline drawn from a fixed seed, so it renders identically
 * on server and client (no Math.random at render time). Purely ornamental.
 */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const WIDTH = 1200;
const HEIGHT = 420;

function buildSkyline() {
  const rand = seeded(11);
  const back: Array<{ x: number; y: number; w: number; h: number }> = [];
  const front: Array<{ x: number; y: number; w: number; h: number }> = [];
  const windows: Array<{ x: number; y: number; o: number }> = [];

  for (let x = 0; x < WIDTH; ) {
    const w = 22 + rand() * 60;
    const h = HEIGHT * (0.18 + rand() * 0.34);
    back.push({ x, y: HEIGHT * 0.88 - h, w, h });
    x += w + 3;
  }
  for (let x = -10; x < WIDTH; ) {
    const w = 36 + rand() * 74;
    const h = HEIGHT * (0.2 + rand() * 0.5);
    const y = HEIGHT * 0.9 - h;
    front.push({ x, y, w, h });
    if (rand() > 0.35) {
      for (let wy = y + 10; wy < HEIGHT * 0.86; wy += 13) {
        for (let wx = x + 7; wx < x + w - 9; wx += 11) {
          if (rand() > 0.64) windows.push({ x: wx, y: wy, o: 0.45 + rand() * 0.5 });
        }
      }
    }
    x += w + 4;
  }
  return { back, front, windows };
}

const skyline = buildSkyline();

export function Skyline({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMax slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="skyline-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#173f4c" />
          <stop offset="0.55" stopColor="#2e6f7d" />
          <stop offset="0.88" stopColor="#d9a877" />
          <stop offset="1" stopColor="#e9be8c" />
        </linearGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="url(#skyline-sky)" />
      <circle cx={WIDTH * 0.8} cy={HEIGHT * 0.62} r={HEIGHT * 0.08} fill="#f6d7a6" opacity="0.85" />
      {skyline.back.map((b, i) => (
        <rect key={`b${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#24505c" opacity="0.8" />
      ))}
      {skyline.front.map((b, i) => (
        <rect key={`f${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="#0f2b35" />
      ))}
      {skyline.windows.map((w, i) => (
        <rect key={`w${i}`} x={w.x} y={w.y} width="4" height="5" fill="#f3c97e" opacity={w.o} />
      ))}
      <rect y={HEIGHT * 0.9} width={WIDTH} height={HEIGHT * 0.1} fill="#1e4a57" />
    </svg>
  );
}
