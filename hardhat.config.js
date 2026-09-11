// © 2025 HighClass Pong. All Rights Reserved.
require("@nomicfoundation/hardhat-toolbox");
try { require("dotenv").config(); } catch (_) {}

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},

    // Cronos Mainnet — real CRO. Deploy here only when ready to go live.
    cronos: {
      url: process.env.CRONOS_RPC_URL || "https://evm.cronos.org",
      chainId: 25,
      accounts,
    },

    // Cronos Testnet — free test CRO from https://cronos.org/faucet
    cronosTestnet: {
      url: process.env.CRONOS_TESTNET_RPC_URL || "https://evm-t3.cronos.org",
      chainId: 338,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      cronos:        process.env.CRONOSCAN_API_KEY || "",
      cronosTestnet: process.env.CRONOSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "cronos",
        chainId: 25,
        urls: {
          apiURL:     "https://api.cronoscan.com/api",
          browserURL: "https://cronoscan.com",
        },
      },
      {
        network: "cronosTestnet",
        chainId: 338,
        urls: {
          apiURL:     "https://api-testnet.cronoscan.com/api",
          browserURL: "https://testnet.cronoscan.com",
        },
      },
    ],
  },
};
