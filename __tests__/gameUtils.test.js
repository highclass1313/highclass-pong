const {
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
  checkAchievements,
  findIslandIndex,
  calcXpGain,
  calcXpLoss,
  advanceCod,
  toFull,
} = require("../src/gameUtils");

// ─────────────────────────────────────────────────────────────
// getRank
// ─────────────────────────────────────────────────────────────
describe("getRank", () => {
  test("returns 0 (Rookie) at 0 XP", () => {
    expect(getRank(0)).toBe(0);
  });

  test("returns 0 (Rookie) just below Amateur threshold", () => {
    expect(getRank(149)).toBe(0);
  });

  test("returns 1 (Amateur) at exactly 150 XP", () => {
    expect(getRank(150)).toBe(1);
  });

  test("returns 1 (Amateur) just below Semi-Pro threshold", () => {
    expect(getRank(399)).toBe(1);
  });

  test("returns 2 (Semi-Pro) at exactly 400 XP", () => {
    expect(getRank(400)).toBe(2);
  });

  test("returns 3 (Pro) at exactly 800 XP", () => {
    expect(getRank(800)).toBe(3);
  });

  test("returns 3 (Pro) just below Elite threshold", () => {
    expect(getRank(1499)).toBe(3);
  });

  test("returns 4 (Elite) at exactly 1500 XP", () => {
    expect(getRank(1500)).toBe(4);
  });

  test("returns 5 (Legend) at exactly 2500 XP", () => {
    expect(getRank(2500)).toBe(5);
  });

  test("returns 5 (Legend) just below HighClass threshold", () => {
    expect(getRank(7999)).toBe(5);
  });

  test("returns 6 (HighClass) at exactly 8000 XP", () => {
    expect(getRank(8000)).toBe(6);
  });

  test("returns 6 (HighClass) well above threshold", () => {
    expect(getRank(99999)).toBe(6);
  });

  test("rank index corresponds to correct RANKS entry", () => {
    expect(RANKS[getRank(0)].name).toBe("Rookie");
    expect(RANKS[getRank(150)].name).toBe("Amateur");
    expect(RANKS[getRank(400)].name).toBe("Semi-Pro");
    expect(RANKS[getRank(800)].name).toBe("Pro");
    expect(RANKS[getRank(1500)].name).toBe("Elite");
    expect(RANKS[getRank(2500)].name).toBe("Legend");
    expect(RANKS[getRank(8000)].name).toBe("HighClass");
  });
});

// ─────────────────────────────────────────────────────────────
// toFull — coordinate mapping
// ─────────────────────────────────────────────────────────────
describe("toFull", () => {
  test("x is unchanged for both sides", () => {
    expect(toFull("top", 50, 30).x).toBe(50);
    expect(toFull("bottom", 50, 30).x).toBe(50);
  });

  test("top side: y=0 maps to 0%", () => {
    expect(toFull("top", 0, 0).y).toBeCloseTo(0);
  });

  test("top side: y=100 maps to 42% of table", () => {
    expect(toFull("top", 0, 100).y).toBeCloseTo(42);
  });

  test("top side: y=50 maps to 21%", () => {
    expect(toFull("top", 0, 50).y).toBeCloseTo(21);
  });

  test("bottom side: y=0 maps to 58%", () => {
    expect(toFull("bottom", 0, 0).y).toBeCloseTo(58);
  });

  test("bottom side: y=100 maps to 100% of table", () => {
    expect(toFull("bottom", 0, 100).y).toBeCloseTo(100);
  });

  test("bottom side: y=50 maps to 79%", () => {
    expect(toFull("bottom", 0, 50).y).toBeCloseTo(79);
  });

  test("top and bottom racks do not overlap", () => {
    // top max = 42, bottom min = 58
    const topMax  = toFull("top",    0, 100).y;
    const botMin  = toFull("bottom", 0, 0).y;
    expect(topMax).toBeLessThan(botMin);
  });

  test("all TOP_POS cups map within 0-42% band", () => {
    TOP_POS.forEach(([lx, ly]) => {
      const { y } = toFull("top", lx, ly);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(42);
    });
  });

  test("all BOT_POS cups map within 58-100% band", () => {
    BOT_POS.forEach(([lx, ly]) => {
      const { y } = toFull("bottom", lx, ly);
      expect(y).toBeGreaterThanOrEqual(58);
      expect(y).toBeLessThanOrEqual(100);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// calcXpGain — XP earned on a make
// ─────────────────────────────────────────────────────────────
describe("calcXpGain", () => {
  test("normal 1-cup make: base 5 XP", () => {
    expect(calcXpGain(1, "normal", 1, false)).toBe(5);
  });

  test("2-cup normal (e.g. island double): 10 XP", () => {
    expect(calcXpGain(2, "normal", 1, false)).toBe(10);
  });

  test("bounce adds 15 XP on top of base", () => {
    expect(calcXpGain(1, "bounce", 1, false)).toBe(20); // 5 + 15
  });

  test("double bounce adds 25 XP on top of base", () => {
    expect(calcXpGain(1, "double", 1, false)).toBe(30); // 5 + 25
  });

  test("streak >= 3 adds 10 XP bonus", () => {
    expect(calcXpGain(1, "normal", 3, false)).toBe(15); // 5 + 10
    expect(calcXpGain(1, "normal", 4, false)).toBe(15);
  });

  test("streak < 3 gives no bonus", () => {
    expect(calcXpGain(1, "normal", 2, false)).toBe(5);
    expect(calcXpGain(1, "normal", 1, false)).toBe(5);
  });

  test("island active adds 20 XP", () => {
    expect(calcXpGain(1, "normal", 1, true)).toBe(25); // 5 + 20
  });

  test("all bonuses stack: bounce + streak3 + island", () => {
    // 5 + 15 + 10 + 20 = 50
    expect(calcXpGain(1, "bounce", 3, true)).toBe(50);
  });

  test("double bounce + streak + island stacks correctly", () => {
    // 5 + 25 + 10 + 20 = 60
    expect(calcXpGain(1, "double", 3, true)).toBe(60);
  });
});

// ─────────────────────────────────────────────────────────────
// calcXpLoss — XP lost on defeat
// ─────────────────────────────────────────────────────────────
describe("calcXpLoss", () => {
  test("loses 25% of current XP (floored)", () => {
    expect(calcXpLoss(100)).toBe(25);
    expect(calcXpLoss(200)).toBe(50);
  });

  test("floors fractional result", () => {
    expect(calcXpLoss(150)).toBe(37); // floor(37.5)
    expect(calcXpLoss(7)).toBe(1);    // floor(1.75)
  });

  test("returns 0 when XP is 0", () => {
    expect(calcXpLoss(0)).toBe(0);
  });

  test("never returns negative", () => {
    expect(calcXpLoss(1)).toBeGreaterThanOrEqual(0);
  });

  test("loss at HighClass entry (8000 XP)", () => {
    expect(calcXpLoss(8000)).toBe(2000); // 25%
  });
});

// ─────────────────────────────────────────────────────────────
// findIslandIndex — isolated cup detection
// ─────────────────────────────────────────────────────────────
describe("findIslandIndex", () => {
  test("returns null when only 1 cup remains (no island possible)", () => {
    expect(findIslandIndex([5], TOP_POS)).toBeNull();
  });

  test("returns null when no cup is isolated (all cups present)", () => {
    const all = TOP_POS.map((_, i) => i);
    expect(findIslandIndex(all, TOP_POS)).toBeNull();
  });

  test("detects a cup isolated from all others", () => {
    // Cup 0 is at [17,5], cup 9 is at [50,59] — far apart
    // With only these two, cup 0 and cup 9 are both >30 units from each other
    const result = findIslandIndex([0, 9], TOP_POS);
    // One of them should be the island (first one with no neighbor)
    expect([0, 9]).toContain(result);
  });

  test("does not return island when two cups are neighbors", () => {
    // Cups 0[17,5] and 1[39,5]: distance = 22, which is < 30 — they're neighbors
    const result = findIslandIndex([0, 1], TOP_POS);
    expect(result).toBeNull();
  });

  test("returns null for empty standing list", () => {
    expect(findIslandIndex([], TOP_POS)).toBeNull();
  });

  test("isolated cup in BOT_POS is also detected", () => {
    // cup 0 [50,41] vs cup 9 [83,95] — far apart
    const result = findIslandIndex([0, 9], BOT_POS);
    expect([0, 9]).toContain(result);
  });
});

// ─────────────────────────────────────────────────────────────
// advanceCod — Circle of Death progress
// ─────────────────────────────────────────────────────────────
describe("advanceCod", () => {
  test("sinking a non-COD cup breaks the sequence", () => {
    const result = advanceCod(new Set(), 1, false); // index 1 is not in COD
    expect(result.broken).toBe(true);
    expect(result.complete).toBe(false);
  });

  test("already-broken sequence stays broken regardless of cup hit", () => {
    const result = advanceCod(new Set([0]), COD[0], true); // brokenCod=true
    expect(result.broken).toBe(true);
    expect(result.complete).toBe(false);
  });

  test("hitting all 4 COD cups returns complete=true", () => {
    let progress = new Set();
    let result;
    for (const idx of COD) {
      result = advanceCod(progress, idx, false);
      progress = result.progress;
    }
    expect(result.complete).toBe(true);
  });

  test("hitting 3 COD cups is not complete yet", () => {
    let progress = new Set();
    let result;
    for (let i = 0; i < 3; i++) {
      result = advanceCod(progress, COD[i], false);
      progress = result.progress;
    }
    expect(result.complete).toBe(false);
  });

  test("hitting same COD cup twice does not double-count", () => {
    let progress = new Set([COD[0], COD[1], COD[2]]);
    const result = advanceCod(progress, COD[0], false); // duplicate
    expect(result.complete).toBe(false);
    expect(result.progress.size).toBe(3);
  });

  test("COD array contains exactly the expected 4 indices", () => {
    expect(COD).toEqual(expect.arrayContaining([0, 3, 9, 5]));
    expect(COD).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────
// checkAchievements
// ─────────────────────────────────────────────────────────────
describe("checkAchievements", () => {
  test("first blood triggers after first make", () => {
    const earned = checkAchievements({ made: 1, streak: 1, misses: 0 }, 5, 0);
    expect(earned).toContain("first");
  });

  test("heating up triggers at streak 2", () => {
    const earned = checkAchievements({ made: 2, streak: 2, misses: 0 }, 10, 0);
    expect(earned).toContain("heat");
  });

  test("on fire triggers at streak 3", () => {
    const earned = checkAchievements({ made: 3, streak: 3, misses: 0 }, 15, 0);
    expect(earned).toContain("fire");
    expect(earned).toContain("heat"); // also still at streak>=2
  });

  test("bounce achievement triggers on first bounce", () => {
    const earned = checkAchievements({ made: 1, streak: 1, bounces: 1, misses: 0 }, 20, 0);
    expect(earned).toContain("bounce");
  });

  test("double bounce achievement triggers", () => {
    const earned = checkAchievements({ made: 1, streak: 1, doubles: 1, misses: 0 }, 30, 0);
    expect(earned).toContain("double");
  });

  test("island achievement triggers", () => {
    const earned = checkAchievements({ made: 1, streak: 1, islands: 1, misses: 0 }, 25, 0);
    expect(earned).toContain("island");
  });

  test("clutch triggers when won with clutch flag", () => {
    const earned = checkAchievements({ made: 10, streak: 1, won: true, clutch: true, misses: 2 }, 100, 0);
    expect(earned).toContain("clutch");
  });

  test("perfect (flawless) triggers when won with zero misses", () => {
    const earned = checkAchievements({ made: 10, streak: 1, won: true, misses: 0 }, 100, 0);
    expect(earned).toContain("perfect");
  });

  test("HighClass achievement triggers at 8000 XP", () => {
    const earned = checkAchievements({ made: 1, streak: 1, misses: 0 }, 8000, 0);
    expect(earned).toContain("hc");
  });

  test("HighClass achievement does NOT trigger below 8000 XP", () => {
    const earned = checkAchievements({ made: 1, streak: 1, misses: 0 }, 7999, 0);
    expect(earned).not.toContain("hc");
  });

  test("NFT achievement triggers at 3 tournament wins", () => {
    const earned = checkAchievements({ made: 1, streak: 1, misses: 0 }, 100, 3);
    expect(earned).toContain("nft");
  });

  test("NFT achievement does NOT trigger at 2 tournament wins", () => {
    const earned = checkAchievements({ made: 1, streak: 1, misses: 0 }, 100, 2);
    expect(earned).not.toContain("nft");
  });

  test("already-unlocked achievements are not re-triggered", () => {
    const alreadyUnlocked = ["first", "heat", "hc"];
    const earned = checkAchievements(
      { made: 3, streak: 3, misses: 0 },
      8000,
      3,
      alreadyUnlocked
    );
    expect(earned).not.toContain("first");
    expect(earned).not.toContain("heat");
    expect(earned).not.toContain("hc");
    // But new ones should still trigger
    expect(earned).toContain("fire");
  });

  test("cod achievement triggers with cod flag", () => {
    const earned = checkAchievements({ made: 1, streak: 1, cod: 1, won: true, misses: 0 }, 80, 0);
    expect(earned).toContain("cod");
  });

  test("returns empty array when nothing is earned", () => {
    const earned = checkAchievements({ made: 0, streak: 0, misses: 0 }, 0, 0);
    expect(earned).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Constants sanity checks
// ─────────────────────────────────────────────────────────────
describe("Game constants", () => {
  test("match economics are consistent: 2 buy-ins = payout + house", () => {
    expect(MATCH_BUYIN * 2).toBe(MATCH_PAY + MATCH_HOUSE);
  });

  test("tournament economics are consistent: 8 buy-ins = payout + house", () => {
    expect(TOURN_BUYIN * 8).toBe(TOURN_POT);
    expect(TOURN_PAY + TOURN_HOUSE).toBe(TOURN_POT);
  });

  test("NFT_WINS threshold is 3", () => {
    expect(NFT_WINS).toBe(3);
  });

  test("HIT_R is positive", () => {
    expect(HIT_R).toBeGreaterThan(0);
  });

  test("RIM_PROB is 1/8", () => {
    expect(RIM_PROB).toBeCloseTo(1 / 8);
  });

  test("RIM_MS is 2200ms", () => {
    expect(RIM_MS).toBe(2200);
  });

  test("TOP_POS has 10 cups", () => {
    expect(TOP_POS).toHaveLength(10);
  });

  test("BOT_POS has 10 cups", () => {
    expect(BOT_POS).toHaveLength(10);
  });

  test("all cup positions have valid x (0-100) and y (0-100)", () => {
    [...TOP_POS, ...BOT_POS].forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(100);
    });
  });

  test("RANKS has 7 entries in ascending XP order", () => {
    expect(RANKS).toHaveLength(7);
    for (let i = 1; i < RANKS.length; i++) {
      expect(RANKS[i].xp).toBeGreaterThan(RANKS[i - 1].xp);
    }
  });
});
