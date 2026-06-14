// HighClass Pong — contract interaction helpers
// Requires ethers.js v6 (loaded via CDN or bundler)
// Set CONTRACT_ADDRESS after deployment.

export const CONTRACT_ADDRESS = import.meta?.env?.VITE_HIGHCLASS_PONG_ADDRESS ?? "";

export const CHAIN_ID  = 25;          // Cronos mainnet
export const CHAIN_HEX = "0x19";
export const RPC_URL   = "https://evm.cronos.org";

// Minimal ABI — only the functions the UI needs
export const ABI = [
  // Write
  "function createMatch() external payable returns (uint256)",
  "function joinMatch(uint256 matchId) external payable",
  "function createTournament() external payable returns (uint256)",
  "function joinTournament(uint256 tournId) external payable",

  // Read
  "function matchCount() external view returns (uint256)",
  "function tournamentCount() external view returns (uint256)",
  "function playerMatches(address) external view returns (uint256)",
  "function playerWins(address) external view returns (uint256)",
  "function tournamentWins(address) external view returns (uint256)",
  "function nftBadgeEarned(address) external view returns (bool)",
  "function getPlayerStats(address) external view returns (uint256 wins, uint256 totalMatches, uint256 tournWins, bool hasNFT)",

  // Events
  "event MatchCreated(uint256 indexed matchId, address indexed player1)",
  "event MatchJoined(uint256 indexed matchId, address indexed player2)",
  "event MatchComplete(uint256 indexed matchId, address indexed winner, uint256 payout)",
  "event TournamentCreated(uint256 indexed tournId, address indexed creator)",
  "event TournamentComplete(uint256 indexed tournId, address indexed winner, uint256 payout)",
  "event NFTBadgeEarned(address indexed player, uint256 tournamentWins)",
];

// ── Wallet ────────────────────────────────────────────────────

export async function connectWallet() {
  if (!window.ethereum) throw new Error("No wallet detected");

  // Switch to / add Cronos
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_HEX,
          chainName: "Cronos Mainnet",
          nativeCurrency: { name: "CRO", symbol: "CRO", decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: ["https://explorer.cronos.org"],
        }],
      });
    } else {
      throw err;
    }
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

export function getContract(signerOrProvider) {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}

// ── Game stats ────────────────────────────────────────────────

export async function fetchGlobalStats() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = getContract(provider);
  const [matchCount, tournamentCount] = await Promise.all([
    contract.matchCount(),
    contract.tournamentCount(),
  ]);
  return {
    matchesPlayed:      Number(matchCount),
    tournamentsPlayed:  Number(tournamentCount),
  };
}

export async function fetchPlayerStats(address) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = getContract(provider);
  const stats = await contract.getPlayerStats(address);
  return {
    wins:        Number(stats.wins),
    totalGames:  Number(stats.totalMatches),
    tournWins:   Number(stats.tournWins),
    hasNFT:      stats.hasNFT,
  };
}

// ── Match actions ─────────────────────────────────────────────

export async function createMatch(signer) {
  const contract = getContract(signer);
  const tx = await contract.createMatch({ value: ethers.parseEther("5") });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(e => e?.name === "MatchCreated");
  return Number(event.args.matchId);
}

export async function joinMatch(signer, matchId) {
  const contract = getContract(signer);
  const tx = await contract.joinMatch(matchId, { value: ethers.parseEther("5") });
  return tx.wait();
}

// ── Tournament actions ────────────────────────────────────────

export async function createTournament(signer) {
  const contract = getContract(signer);
  const tx = await contract.createTournament({ value: ethers.parseEther("10") });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(e => e?.name === "TournamentCreated");
  return Number(event.args.tournId);
}

export async function joinTournament(signer, tournId) {
  const contract = getContract(signer);
  const tx = await contract.joinTournament(tournId, { value: ethers.parseEther("10") });
  return tx.wait();
}
