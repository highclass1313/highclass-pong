// © 2025 HighClass Pong. All Rights Reserved.
//
// Wallet + contract layer. Wraps MetaMask (or any EIP-1193 wallet) and the
// HighClassPong contract so the UI can stay free of Web3 plumbing.
//
// Every function returns { ok, ... } or { ok:false, error } — the UI never
// has to try/catch, and user rejections read the same as any other failure.

export const CHAINS = {
  25: {
    chainId: "0x19",
    chainName: "Cronos Mainnet",
    nativeCurrency: { name: "Cronos", symbol: "CRO", decimals: 18 },
    rpcUrls: ["https://evm.cronos.org"],
    blockExplorerUrls: ["https://cronoscan.com"],
  },
  338: {
    chainId: "0x152",
    chainName: "Cronos Testnet",
    nativeCurrency: { name: "Test Cronos", symbol: "TCRO", decimals: 18 },
    rpcUrls: ["https://evm-t3.cronos.org"],
    blockExplorerUrls: ["https://testnet.cronoscan.com"],
  },
};

// Minimal ABI — only what the UI calls.
export const ABI = [
  "function createMatch() payable returns (uint256)",
  "function joinMatch(uint256 matchId) payable",
  "function cancelMatch(uint256 matchId)",
  "function createTournament() payable returns (uint256)",
  "function joinTournament(uint256 tournId) payable",
  "function getMatch(uint256 matchId) view returns (tuple(address player1, address player2, uint256 pot, address winner, uint8 status, uint256 createdAt))",
  "function getTournament(uint256 tournId) view returns (address[8] players, uint256 playerCount, uint256 pot, address winner, bool complete)",
  "function getPlayerStats(address player) view returns (uint256 wins, uint256 totalMatches, uint256 tournWins, bool hasNFT)",
  "function matchCount() view returns (uint256)",
  "function tournamentCount() view returns (uint256)",
  "function owner() view returns (address)",
  "event MatchCreated(uint256 indexed matchId, address indexed player1)",
  "event MatchJoined(uint256 indexed matchId, address indexed player2)",
  "event TournamentCreated(uint256 indexed tournId, address indexed creator)",
];

export const MATCH_BUYIN_CRO = "5";
export const TOURN_BUYIN_CRO = "10";

let _ethers = null;

// ethers is loaded from CDN on demand so the game's free modes never pay the
// download cost. Resolves to the ethers v6 namespace.
async function getEthers() {
  if (_ethers) return _ethers;
  if (typeof window !== "undefined" && window.ethers) {
    _ethers = window.ethers;
    return _ethers;
  }
  _ethers = await import("https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm");
  return _ethers;
}

export function hasWallet() {
  return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
}

function readConfiguredAddress(chainId) {
  try {
    // Written by scripts/deploy.js at deploy time.
    const cfg = window.__HCP_CONTRACTS__ || {};
    return cfg[chainId]?.address || null;
  } catch (_) {
    return null;
  }
}

function normaliseError(err) {
  // 4001 is the EIP-1193 "user rejected" code — not worth an alarming message.
  if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
    return "Transaction cancelled.";
  }
  if (err?.code === -32002) {
    return "Wallet request already pending — check your wallet.";
  }
  return err?.reason || err?.shortMessage || err?.message || "Something went wrong.";
}

/** Prompt the wallet to connect. */
export async function connect() {
  if (!hasWallet()) {
    return { ok: false, error: "No wallet found. Install MetaMask to play for CRO." };
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    if (!accounts?.length) return { ok: false, error: "No account selected." };

    const hexChain = await window.ethereum.request({ method: "eth_chainId" });
    return { ok: true, address: accounts[0], chainId: parseInt(hexChain, 16) };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

/** Switch the wallet to Cronos, adding the network if it isn't there yet. */
export async function switchChain(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) return { ok: false, error: `Unsupported chain ${chainId}` };

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.chainId }],
    });
    return { ok: true };
  } catch (err) {
    // 4902 = chain unknown to the wallet; add it, which also switches.
    if (err?.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [chain],
        });
        return { ok: true };
      } catch (addErr) {
        return { ok: false, error: normaliseError(addErr) };
      }
    }
    return { ok: false, error: normaliseError(err) };
  }
}

async function getContract(chainId) {
  const ethers  = await getEthers();
  const address = readConfiguredAddress(chainId);
  if (!address) {
    return { ok: false, error: "Contract not deployed on this network yet." };
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer   = await provider.getSigner();
  return { ok: true, contract: new ethers.Contract(address, ABI, signer), ethers, address };
}

export async function getBalance(address) {
  try {
    const ethers   = await getEthers();
    const provider = new ethers.BrowserProvider(window.ethereum);
    const bal      = await provider.getBalance(address);
    return { ok: true, cro: ethers.formatEther(bal) };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

/** Create a new 5 CRO match. Resolves with the on-chain matchId. */
export async function createMatch(chainId) {
  const c = await getContract(chainId);
  if (!c.ok) return c;
  try {
    const tx = await c.contract.createMatch({
      value: c.ethers.parseEther(MATCH_BUYIN_CRO),
    });
    const receipt = await tx.wait();

    // Pull the id out of the MatchCreated event rather than guessing from
    // matchCount, which another player's tx could have moved.
    let matchId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = c.contract.interface.parseLog(log);
        if (parsed?.name === "MatchCreated") { matchId = Number(parsed.args[0]); break; }
      } catch (_) { /* log from another contract */ }
    }
    return { ok: true, matchId, txHash: receipt.hash };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

export async function joinMatch(chainId, matchId) {
  const c = await getContract(chainId);
  if (!c.ok) return c;
  try {
    const tx = await c.contract.joinMatch(matchId, {
      value: c.ethers.parseEther(MATCH_BUYIN_CRO),
    });
    const receipt = await tx.wait();
    return { ok: true, txHash: receipt.hash };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

export async function cancelMatch(chainId, matchId) {
  const c = await getContract(chainId);
  if (!c.ok) return c;
  try {
    const tx = await c.contract.cancelMatch(matchId);
    const receipt = await tx.wait();
    return { ok: true, txHash: receipt.hash };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

export async function createTournament(chainId) {
  const c = await getContract(chainId);
  if (!c.ok) return c;
  try {
    const tx = await c.contract.createTournament({
      value: c.ethers.parseEther(TOURN_BUYIN_CRO),
    });
    const receipt = await tx.wait();

    let tournId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = c.contract.interface.parseLog(log);
        if (parsed?.name === "TournamentCreated") { tournId = Number(parsed.args[0]); break; }
      } catch (_) { /* log from another contract */ }
    }
    return { ok: true, tournId, txHash: receipt.hash };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

export async function joinTournament(chainId, tournId) {
  const c = await getContract(chainId);
  if (!c.ok) return c;
  try {
    const tx = await c.contract.joinTournament(tournId, {
      value: c.ethers.parseEther(TOURN_BUYIN_CRO),
    });
    const receipt = await tx.wait();
    return { ok: true, txHash: receipt.hash };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

export async function getPlayerStats(chainId, address) {
  const c = await getContract(chainId);
  if (!c.ok) return c;
  try {
    const [wins, totalMatches, tournWins, hasNFT] =
      await c.contract.getPlayerStats(address);
    return {
      ok: true,
      wins: Number(wins),
      totalMatches: Number(totalMatches),
      tournWins: Number(tournWins),
      hasNFT,
    };
  } catch (err) {
    return { ok: false, error: normaliseError(err) };
  }
}

/** Subscribe to wallet account/chain changes. Returns an unsubscribe fn. */
export function onWalletChange({ onAccounts, onChain }) {
  if (!hasWallet()) return () => {};
  const accHandler   = (accts) => onAccounts?.(accts[0] || null);
  const chainHandler = (hex)   => onChain?.(parseInt(hex, 16));
  window.ethereum.on("accountsChanged", accHandler);
  window.ethereum.on("chainChanged", chainHandler);
  return () => {
    window.ethereum.removeListener("accountsChanged", accHandler);
    window.ethereum.removeListener("chainChanged", chainHandler);
  };
}

export function shortAddress(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}
