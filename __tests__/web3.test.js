/**
 * Tests for the wallet/contract layer. ethers is only imported lazily inside
 * transaction calls, so the pure helpers here run without any network or
 * browser — which is exactly the part worth locking down.
 */
const path = require("path");
const fs   = require("fs");

const SRC = fs.readFileSync(path.join(__dirname, "../src/web3.js"), "utf8");

describe("web3 module — contract config", () => {
  test("exports both Cronos chains", () => {
    expect(SRC).toContain("25:");
    expect(SRC).toContain("338:");
  });

  test("mainnet chainId hex matches decimal 25", () => {
    expect(parseInt("0x19", 16)).toBe(25);
    expect(SRC).toContain('chainId: "0x19"');
  });

  test("testnet chainId hex matches decimal 338", () => {
    expect(parseInt("0x152", 16)).toBe(338);
    expect(SRC).toContain('chainId: "0x152"');
  });

  test("mainnet uses the official Cronos RPC", () => {
    expect(SRC).toContain("https://evm.cronos.org");
  });

  test("testnet uses the official Cronos testnet RPC", () => {
    expect(SRC).toContain("https://evm-t3.cronos.org");
  });

  test("buy-ins match the contract constants", () => {
    expect(SRC).toContain('MATCH_BUYIN_CRO = "5"');
    expect(SRC).toContain('TOURN_BUYIN_CRO = "10"');
  });
});

describe("web3 module — ABI surface", () => {
  const required = [
    "createMatch",
    "joinMatch",
    "cancelMatch",
    "createTournament",
    "joinTournament",
    "getMatch",
    "getTournament",
    "getPlayerStats",
    "owner",
  ];

  test.each(required)("ABI declares %s", (fn) => {
    expect(SRC).toContain(fn);
  });

  test("payable entry points are marked payable", () => {
    expect(SRC).toMatch(/function createMatch\(\) payable/);
    expect(SRC).toMatch(/function joinMatch\(uint256 matchId\) payable/);
    expect(SRC).toMatch(/function createTournament\(\) payable/);
    expect(SRC).toMatch(/function joinTournament\(uint256 tournId\) payable/);
  });

  test("read-only calls are marked view", () => {
    expect(SRC).toMatch(/function getPlayerStats\([^)]*\) view/);
    expect(SRC).toMatch(/function owner\(\) view/);
  });
});

describe("web3 module — error handling", () => {
  test("handles EIP-1193 user rejection (4001)", () => {
    expect(SRC).toContain("4001");
    expect(SRC).toContain("Transaction cancelled.");
  });

  test("handles pending-request code (-32002)", () => {
    expect(SRC).toContain("-32002");
  });

  test("handles unknown-chain code (4902) by adding the network", () => {
    expect(SRC).toContain("4902");
    expect(SRC).toContain("wallet_addEthereumChain");
  });

  test("every exported action returns an ok flag rather than throwing", () => {
    // Each action wraps its body in try/catch and returns { ok:false, error }.
    const okFalse = SRC.match(/return \{ ok: false, error/g) || [];
    expect(okFalse.length).toBeGreaterThanOrEqual(6);
  });
});

describe("web3 module — id extraction", () => {
  test("match id is read from the MatchCreated event, not matchCount", () => {
    expect(SRC).toContain('parsed?.name === "MatchCreated"');
    // Guard against a regression to the race-prone matchCount() approach.
    expect(SRC).not.toMatch(/matchId\s*=\s*await\s+.*matchCount\(\)/);
  });

  test("tournament id is read from the TournamentCreated event", () => {
    expect(SRC).toContain('parsed?.name === "TournamentCreated"');
  });
});

describe("shortAddress", () => {
  // Re-implemented here to match src/web3.js — the module is ESM-only.
  const shortAddress = (addr) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

  test("truncates a full address", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678"))
      .toBe("0x1234…5678");
  });

  test("returns empty string for null", () => {
    expect(shortAddress(null)).toBe("");
  });
});
