// Compiles HighClassPong.sol using the bundled solc npm package and writes
// a Hardhat-compatible artifact, avoiding any network download of the compiler.
const fs   = require("fs");
const path = require("path");
const solc = require("solc");

const contractPath = path.join(__dirname, "../contracts/HighClassPong.sol");
const src = fs.readFileSync(contractPath, "utf8");

const input = JSON.stringify({
  language: "Solidity",
  sources: { "HighClassPong.sol": { content: src } },
  settings: {
    outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    optimizer: { enabled: false },
  },
});

const output = JSON.parse(solc.compile(input));

if (output.errors) {
  const errors = output.errors.filter(e => e.severity === "error");
  if (errors.length) {
    errors.forEach(e => console.error(e.formattedMessage));
    process.exit(1);
  }
}

const compiled = output.contracts["HighClassPong.sol"]["HighClassPong"];

const artifact = {
  _format: "hh-sol-artifact-1",
  contractName: "HighClassPong",
  sourceName: "contracts/HighClassPong.sol",
  abi: compiled.abi,
  bytecode: "0x" + compiled.evm.bytecode.object,
  deployedBytecode: "0x",
  linkReferences: {},
  deployedLinkReferences: {},
};

const outDir = path.join(__dirname, "../artifacts/contracts/HighClassPong.sol");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "HighClassPong.json"), JSON.stringify(artifact, null, 2));

console.log("Compiled HighClassPong.sol OK");
