// Pure game logic extracted from HighClassPong.jsx for unit testing.
// No React, no DOM, no browser APIs — all functions are deterministic.

const RANKS = [
  { name: "Rookie",   xp: 0,    icon: "🥉", color: "#8B6914" },
  { name: "Amateur",  xp: 150,  icon: "🥈", color: "#9e9e9e" },
  { name: "Semi-Pro", xp: 400,  icon: "🥇", color: "#DAA520" },
  { name: "Pro",      xp: 800,  icon: "💎", color: "#29B6F6" },
  { name: "Elite",    xp: 1500, icon: "🔥", color: "#FF7043" },
  { name: "Legend",   xp: 2500, icon: "⚡", color: "#BA68C8" },
  { name: "HighClass",xp: 8000, icon: "👑", color: "#F5C030" },
];

const getRank = (xp) => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].xp) return i;
  }
  return 0;
};

const TOP_POS = [
  [17, 5],  [39, 5],  [61, 5],  [83, 5],
  [28, 23], [50, 23], [72, 23],
  [39, 41], [61, 41],
  [50, 59],
];

const BOT_POS = [
  [50, 41],
  [39, 59], [61, 59],
  [28, 77], [50, 77], [72, 77],
  [17, 95], [39, 95], [61, 95], [83, 95],
];

// Top rack: y maps to 0–42% of table. Bot: 58–100%.
const toFull = (side, lx, ly) => ({
  x: lx,
  y: side === "top" ? ly * 0.42 : 58 + ly * 0.42,
});

const COD = [0, 3, 9, 5]; // corner + center indices

const HIT_R   = 7.5;
const RIM_PROB = 1 / 8;
const RIM_MS   = 2200;

const MATCH_BUYIN = 5;
const MATCH_PAY   = 8;
const MATCH_HOUSE = 2;
const TOURN_BUYIN = 10;
const TOURN_PAY   = 60;
const TOURN_HOUSE = 20;
const TOURN_POT   = 80;
const NFT_WINS    = 3;

const ACHIEVEMENTS = [
  { id: "first",   chk: (s)         => s.made >= 1 },
  { id: "heat",    chk: (s)         => s.streak >= 2 },
  { id: "fire",    chk: (s)         => s.streak >= 3 },
  { id: "bounce",  chk: (s)         => (s.bounces || 0) >= 1 },
  { id: "double",  chk: (s)         => (s.doubles || 0) >= 1 },
  { id: "island",  chk: (s)         => (s.islands || 0) >= 1 },
  { id: "finger",  chk: (s)         => (s.fingers || 0) >= 1 },
  { id: "cod",     chk: (s)         => (s.cod || 0) >= 1 },
  { id: "clutch",  chk: (s)         => s.won && s.clutch },
  { id: "perfect", chk: (s)         => s.won && s.misses === 0 },
  { id: "hc",      chk: (_, xp)     => xp >= 8000 },
  { id: "nft",     chk: (_, __, tw) => tw >= NFT_WINS },
];

/**
 * Returns achievement IDs newly earned given current stats, xp, and tournWins.
 * Filters against already-unlocked set so each triggers only once.
 */
const checkAchievements = (stats, xp, tournWins, alreadyUnlocked = []) =>
  ACHIEVEMENTS
    .filter(a => !alreadyUnlocked.includes(a.id) && a.chk(stats, xp, tournWins))
    .map(a => a.id);

/**
 * Core island detection: given a list of standing cup indices and their
 * [x,y] positions, returns the index of an isolated cup (no neighbor within
 * distance 30), or null if none.
 */
const findIslandIndex = (standingIndices, pos) => {
  if (standingIndices.length <= 1) return null;
  for (const idx of standingIndices) {
    const [x1, y1] = pos[idx];
    const hasNeighbor = standingIndices.some(j => {
      if (j === idx) return false;
      const [x2, y2] = pos[j];
      return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2) < 30;
    });
    if (!hasNeighbor) return idx;
  }
  return null;
};

/**
 * Calculates XP earned for a single sink event.
 * shotType: "normal" | "bounce" | "double"
 * cupsRemoved: number of cups sunk (1 normally, 2 for double-bounce rule)
 * streak: current make streak AFTER this shot
 * islandActive: whether an island was called
 */
const calcXpGain = (cupsRemoved, shotType, streak, islandActive) => {
  let xp = 5 * cupsRemoved;
  if (shotType === "bounce") xp += 15;
  if (shotType === "double") xp += 25;
  if (streak >= 3) xp += 10;
  if (islandActive) xp += 20;
  return xp;
};

/**
 * Calculates XP lost on a miss: 25% of current XP, floored, minimum 0.
 */
const calcXpLoss = (currentXp) => Math.floor(currentXp * 0.25);

/**
 * Returns whether tapping the four COD cups in any order completes the set.
 * codProgress: Set of already-hit COD indices for this shooter.
 * newIdx: the cup index just sunk.
 * brokenCod: whether this shooter already broke the COD sequence.
 */
const advanceCod = (codProgress, newIdx, brokenCod) => {
  if (brokenCod) return { complete: false, broken: true, progress: codProgress };
  if (!COD.includes(newIdx)) return { complete: false, broken: true, progress: codProgress };
  const next = new Set(codProgress);
  next.add(newIdx);
  return { complete: next.size === 4, broken: false, progress: next };
};

module.exports = {
  RANKS,
  getRank,
  TOP_POS,
  BOT_POS,
  COD,
  HIT_R,
  RIM_PROB,
  RIM_MS,
  MATCH_BUYIN,
  MATCH_PAY,
  MATCH_HOUSE,
  TOURN_BUYIN,
  TOURN_PAY,
  TOURN_HOUSE,
  TOURN_POT,
  NFT_WINS,
  ACHIEVEMENTS,
  checkAchievements,
  findIslandIndex,
  calcXpGain,
  calcXpLoss,
  advanceCod,
  toFull,
};
