// © 2025 HighClass Pong. All Rights Reserved.
//
// ORACLE SERVER
// resolveMatch() and resolveTournament() are onlyOwner. This server holds the
// owner key and calls them when a game finishes, so payouts happen without
// you signing every transaction by hand.
//
//   npm run oracle
//
// On boot it refuses to start unless the wallet it loaded is the actual
// on-chain owner of the contract — so it can never be pointed at someone
// else's deployment, and a wrong key fails loudly instead of silently.

const http   = require("http");
const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const { ethers } = require("ethers");

try { require("dotenv").config(); } catch (_) {}

const RPC_BY_CHAIN = {
  25:  process.env.CRONOS_RPC_URL         || "https://evm.cronos.org",
  338: process.env.CRONOS_TESTNET_RPC_URL || "https://evm-t3.cronos.org",
};

const CHAIN_ID   = Number(process.env.CHAIN_ID || 338);
const PORT       = Number(process.env.ORACLE_PORT || 8787);
const API_KEY    = process.env.ORACLE_API_KEY || "";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

function loadContractAddress() {
  if (process.env.CONTRACT_ADDRESS) return process.env.CONTRACT_ADDRESS;
  try {
    const rec = JSON.parse(
      fs.readFileSync(path.join(__dirname, `../deployments/${CHAIN_ID}.json`), "utf8")
    );
    return rec.address;
  } catch (_) {
    return null;
  }
}

function loadAbi() {
  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../artifacts/contracts/HighClassPong.sol/HighClassPong.json"),
      "utf8"
    )
  );
  return artifact.abi;
}

// Timing-safe key comparison so the API key can't be guessed byte by byte.
function validKey(provided) {
  if (!API_KEY) return false;
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(API_KEY);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function send(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > limit) { reject(new Error("Payload too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (_) { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is not set (see .env.example)");
  if (!API_KEY)     throw new Error("ORACLE_API_KEY is not set (see .env.example)");

  const address = loadContractAddress();
  if (!address) {
    throw new Error(
      `No contract address. Deploy first, or set CONTRACT_ADDRESS in .env.`
    );
  }

  const rpc = RPC_BY_CHAIN[CHAIN_ID];
  if (!rpc) throw new Error(`Unsupported CHAIN_ID ${CHAIN_ID} (expected 25 or 338)`);

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(address, loadAbi(), wallet);

  // ── Ownership gate ───────────────────────────────────────────
  const onChainOwner = await contract.owner();
  const isMine = onChainOwner.toLowerCase() === wallet.address.toLowerCase();

  console.log("");
  console.log("═".repeat(62));
  console.log("  HIGHCLASS PONG — ORACLE");
  console.log("═".repeat(62));
  console.log(`  Chain     : ${CHAIN_ID}`);
  console.log(`  Contract  : ${address}`);
  console.log(`  Wallet    : ${wallet.address}`);
  console.log(`  On-chain  : ${onChainOwner}`);
  console.log(`  Is yours  : ${isMine ? "✅ YES" : "❌ NO"}`);
  console.log("═".repeat(62));

  if (!isMine) {
    throw new Error(
      `This wallet is NOT the contract owner.\n` +
      `  Contract owner : ${onChainOwner}\n` +
      `  Your wallet    : ${wallet.address}\n` +
      `Refusing to start — resolve calls would revert.`
    );
  }

  const bal = await provider.getBalance(wallet.address);
  console.log(`  Gas balance: ${ethers.formatEther(bal)} CRO`);
  if (bal === 0n) console.log("  ⚠️  Zero balance — resolve calls will fail until funded.");

  // ── HTTP API ─────────────────────────────────────────────────
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { ok: true, contract: address, owner: wallet.address, chainId: CHAIN_ID });
    }

    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

    if (!validKey(req.headers["x-oracle-key"])) {
      return send(res, 401, { error: "Unauthorized" });
    }

    let body;
    try { body = await readJson(req); }
    catch (e) { return send(res, 400, { error: e.message }); }

    try {
      if (req.url === "/resolve-match") {
        const { matchId, winner } = body;
        if (!Number.isInteger(matchId) || matchId < 0) {
          return send(res, 400, { error: "matchId must be a non-negative integer" });
        }
        if (!ethers.isAddress(winner)) {
          return send(res, 400, { error: "winner must be a valid address" });
        }

        console.log(`→ resolveMatch(${matchId}, ${winner})`);
        const tx = await contract.resolveMatch(matchId, winner);
        const receipt = await tx.wait();
        console.log(`✅ match ${matchId} resolved — ${receipt.hash}`);
        return send(res, 200, { ok: true, txHash: receipt.hash, matchId, winner });
      }

      if (req.url === "/resolve-tournament") {
        const { tournamentId, winner } = body;
        if (!Number.isInteger(tournamentId) || tournamentId < 0) {
          return send(res, 400, { error: "tournamentId must be a non-negative integer" });
        }
        if (!ethers.isAddress(winner)) {
          return send(res, 400, { error: "winner must be a valid address" });
        }

        console.log(`→ resolveTournament(${tournamentId}, ${winner})`);
        const tx = await contract.resolveTournament(tournamentId, winner);
        const receipt = await tx.wait();
        console.log(`✅ tournament ${tournamentId} resolved — ${receipt.hash}`);
        return send(res, 200, { ok: true, txHash: receipt.hash, tournamentId, winner });
      }

      return send(res, 404, { error: "Not found" });
    } catch (err) {
      // Surface the revert reason rather than a generic 500 — makes a bad
      // matchId or an already-resolved match obvious from the response.
      const reason = err.reason || err.shortMessage || err.message;
      console.error(`❌ ${reason}`);
      return send(res, 400, { error: reason });
    }
  });

  server.listen(PORT, () => {
    console.log(`\n  Listening on http://localhost:${PORT}`);
    console.log(`    GET  /health`);
    console.log(`    POST /resolve-match       { matchId, winner }`);
    console.log(`    POST /resolve-tournament  { tournamentId, winner }`);
    console.log(`  All POSTs require header: x-oracle-key: <ORACLE_API_KEY>\n`);
  });
}

main().catch(err => {
  console.error(`\n❌ Oracle failed to start:\n${err.message}\n`);
  process.exitCode = 1;
});
