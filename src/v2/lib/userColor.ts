// Stable, deterministic per-user color. Same `userId` always gets the
// same hex — no negotiation, no storage. 8 entries is enough for our
// team sizes; collisions are acceptable.
const PALETTE = [
  '#FF3B30', // red
  '#FF9500', // orange
  '#FFCC00', // yellow
  '#34C759', // green
  '#00C7BE', // teal
  '#007AFF', // blue
  '#AF52DE', // purple
  '#FF2D55', // pink
];

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export const userColor = (userId: string): string =>
  PALETTE[hash(userId) % PALETTE.length];
