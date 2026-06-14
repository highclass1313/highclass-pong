// HighClass Pong — contract interaction helpers
// Requires ethers.js v6 (loaded via CDN or bundler)
// Set CONTRACT_ADDRESS after deployment.

export const CONTRACT_ADDRESS = import.meta?.env?.VITE_HIGHCLASS_PONG_ADDRESS ?? "";

export const CHAIN_ID  = 25;          // Cronos mainnet
export const CHAIN_HEX = "0x19";
export const RPC_URL   = "https://evm.cronos.org";

// Full ABI for contract interaction
export const ABI = [
  // Match functions
  "function createMatch() external payable returns (uint256)",
  "function joinMatch(uint256 matchId) external payable",
  "function resolveMatch(uint256 matchId, address winner) external",
  "function cancelMatch(uint256 matchId) external",
  
  // Tournament functions
  "function createTournament() external payable returns (uint256)",
  "function joinTournament(uint256 tournId) external payable",
  "function resolveTournament(uint256 tournId, address winner) external",
  
  // Owner functions
  "function withdrawHouse() external",
  "function transferOwnership(address newOwner) external",
  
  // View functions
  "function matchCount() external view returns (uint256)",
  "function tournamentCount() external view returns (uint256)",
  "function houseBalance() external view returns (uint256)",
  "function playerMatches(address) external view returns (uint256)",
  "function playerWins(address) external view returns (uint256)",
  "function tournamentWins(address) external view returns (uint256)",
  "function nftBadgeEarned(address) external view returns (bool)",
  "function getMatch(uint256) external view returns (tuple(address player1, address player2, uint256 pot, address winner, uint8 status, uint256 createdAt))",
  "function getTournament(uint256) external view returns (address[8] players, uint256 playerCount, uint256 pot, address winner, bool complete)",
  "function getPlayerStats(address) external view returns (uint256 wins, uint256 totalMatches, uint256 tournWins, bool hasNFT)",
  "function contractBalance() external view returns (uint256)",
  "function owner() external view returns (address)",
  
  // Events
  "event MatchCreated(uint256 indexed matchId, address indexed player1)",
  "event MatchJoined(uint256 indexed matchId, address indexed player2)",
  "event MatchComplete(uint256 indexed matchId, address indexed winner, uint256 payout)",
  "event MatchCancelled(uint256 indexed matchId)",
  "event TournamentCreated(uint256 indexed tournId, address indexed creator)",
  "event TournamentJoined(uint256 indexed tournId, address indexed player, uint256 playerCount)",
  "event TournamentComplete(uint256 indexed tournId, address indexed winner, uint256 payout)",
  "event NFTBadgeEarned(address indexed player, uint256 tournamentWins)",
  "event HouseWithdraw(address indexed owner, uint256 amount)",
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
  if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set");
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
}

// ── Contract Setup Verification ────────────────────────────────

export async function verifyContractDeployment() {
  if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set in env");
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = getContract(provider);
  
  try {
    const owner = await contract.owner();
    const balance = await contract.contractBalance();
    return {
      deployed: true,
      address: CONTRACT_ADDRESS,
      owner,
      balance: ethers.formatEther(balance),
    };
  } catch (e) {
    throw new Error(`Contract not found at ${CONTRACT_ADDRESS}: ${e.message}`);
  }
}

// ── Game stats ────────────────────────────────────────────────

export async function fetchGlobalStats() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = getContract(provider);
  const [matchCount, tournamentCount, balance] = await Promise.all([
    contract.matchCount(),
    contract.tournamentCount(),
    contract.contractBalance(),
  ]);
  return {
    matchesPlayed:      Number(matchCount),
    tournamentsPlayed:  Number(tournamentCount),
    contractBalance:    ethers.formatEther(balance),
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

export async function fetchHouseBalance() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = getContract(provider);
  const balance = await contract.houseBalance();
  return ethers.formatEther(balance);
}

// ── Match actions ─────────────────────────────────────────────

export async function createMatch(signer) {
  const contract = getContract(signer);
  const tx = await contract.createMatch({ value: ethers.parseEther("5") });
  const receipt = await tx.wait();
  const event = receipt.logs
    .map(l => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find(e => e?.name === "MatchCreated");
  if (!event) throw new Error("MatchCreated event not found");
  return Number(event.args.matchId);
}

export async function joinMatch(signer, matchId) {
  const contract = getContract(signer);
  const tx = await contract.joinMatch(matchId, { value: ethers.parseEther("5") });
  return tx.wait();
}

export async function resolveMatch(signer, matchId, winnerAddress) {
  const contract = getContract(signer);
  const tx = await contract.resolveMatch(matchId, winnerAddress);
  return tx.wait();
}

export async function cancelMatch(signer, matchId) {
  const contract = getContract(signer);
  const tx = await contract.cancelMatch(matchId);
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
  if (!event) throw new Error("TournamentCreated event not found");
  return Number(event.args.tournId);
}

export async function joinTournament(signer, tournId) {
  const contract = getContract(signer);
  const tx = await contract.joinTournament(tournId, { value: ethers.parseEther("10") });
  return tx.wait();
}

export async function resolveTournament(signer, tournId, winnerAddress) {
  const contract = getContract(signer);
  const tx = await contract.resolveTournament(tournId, winnerAddress);
  return tx.wait();
}

// ── Owner functions ───────────────────────────────────────────

export async function withdrawHouse(signer) {
  const contract = getContract(signer);
  const tx = await contract.withdrawHouse();
  return tx.wait();
}

export async function transferOwnership(signer, newOwnerAddress) {
  const contract = getContract(signer);
  const tx = await contract.transferOwnership(newOwnerAddress);
  return tx.wait();
}
