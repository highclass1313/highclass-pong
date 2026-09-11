// © 2025 HighClass Pong. All Rights Reserved.
//
// Deploys HighClassPong and verifies YOU are the owner.
// The wallet whose private key is in DEPLOYER_PRIVATE_KEY becomes the
// permanent owner — the only address that can resolve matches, resolve
// tournaments, and withdraw house revenue.
//
//   npx hardhat run scripts/deploy.js --network cronosTestnet
//   npx hardhat run scripts/deploy.js --network cronos

const fs   = require("fs");
const path = require("path");
const hre  = require("hardhat");

const CHAIN_NAMES = {
  25:  "Cronos Mainnet",
  338: "Cronos Testnet",
  31337: "Hardhat Local",
};

const EXPLORERS = {
  25:  "https://cronoscan.com",
  338: "https://testnet.cronoscan.com",
};

async function main() {
  const { ethers } = hre;
  const net     = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const chain   = CHAIN_NAMES[chainId] || `Chain ${chainId}`;

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account. Set DEPLOYER_PRIVATE_KEY in your .env file."
    );
  }

  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("");
  console.log("═".repeat(62));
  console.log("  HIGHCLASS PONG — DEPLOYMENT");
  console.log("═".repeat(62));
  console.log(`  Network   : ${chain} (chainId ${chainId})`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${ethers.formatEther(balance)} CRO`);
  console.log("═".repeat(62));

  if (balance === 0n) {
    throw new Error(
      "Deployer has 0 CRO — fund this wallet before deploying.\n" +
      "  Testnet faucet: https://cronos.org/faucet"
    );
  }

  // Mainnet gets a deliberate pause so a real deploy is never an accident.
  if (chainId === 25) {
    console.log("");
    console.log("  ⚠️  MAINNET DEPLOYMENT — this spends real CRO.");
    console.log("  Deploying in 10 seconds. Ctrl-C to abort.");
    await new Promise(r => setTimeout(r, 10_000));
  }

  console.log("\n  Deploying contract...");
  const Factory  = await ethers.getContractFactory("HighClassPong");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const tx      = contract.deploymentTransaction();

  // ── Ownership verification ───────────────────────────────────
  // Confirm on-chain that the deployed contract recognises YOU as owner.
  const onChainOwner = await contract.owner();
  const isMine = onChainOwner.toLowerCase() === deployer.address.toLowerCase();

  console.log("");
  console.log("═".repeat(62));
  console.log("  ✅ DEPLOYED");
  console.log("═".repeat(62));
  console.log(`  Contract  : ${address}`);
  console.log(`  Tx hash   : ${tx?.hash || "n/a"}`);
  console.log(`  Owner     : ${onChainOwner}`);
  console.log(`  Is yours  : ${isMine ? "✅ YES — you control this contract" : "❌ NO"}`);
  if (EXPLORERS[chainId]) {
    console.log(`  Explorer  : ${EXPLORERS[chainId]}/address/${address}`);
  }
  console.log("═".repeat(62));

  if (!isMine) {
    throw new Error(
      `OWNERSHIP MISMATCH — contract owner is ${onChainOwner}, ` +
      `expected ${deployer.address}. Do not use this deployment.`
    );
  }

  // ── Persist deployment record ────────────────────────────────
  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });

  const record = {
    network:     chain,
    chainId,
    address,
    owner:       onChainOwner,
    deployedBy:  deployer.address,
    txHash:      tx?.hash || null,
    deployedAt:  new Date().toISOString(),
    explorer:    EXPLORERS[chainId] ? `${EXPLORERS[chainId]}/address/${address}` : null,
  };

  const outFile = path.join(outDir, `${chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\n  Deployment record → deployments/${chainId}.json`);

  // Write the address into the frontend config so the UI picks it up.
  const cfgPath = path.join(__dirname, "../src/contractConfig.json");
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch (_) {}
  cfg[chainId] = { address, owner: onChainOwner };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  console.log(`  Frontend config  → src/contractConfig.json`);

  console.log("\n  Next steps:");
  console.log("    1. Verify on explorer:");
  console.log(`       npx hardhat verify --network ${hre.network.name} ${address}`);
  console.log("    2. Start the oracle so matches can be resolved:");
  console.log(`       CONTRACT_ADDRESS=${address} npm run oracle`);
  console.log("");
}

main().catch(err => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exitCode = 1;
});
