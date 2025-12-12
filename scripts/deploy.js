// scripts/deploy.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("Deploying the contracts with the account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address))
  );

  const LendingPlatform = await ethers.getContractFactory("LendingPlatform");
  const lending = await LendingPlatform.deploy();
  await lending.waitForDeployment();

  const lendingAddress = await lending.getAddress();
  console.log("LendingPlatform deployed to:", lendingAddress);

  await writeFrontendFiles(ethers, lendingAddress);
}

async function writeFrontendFiles(ethers, lendingAddress) {
  const contractsDir = path.join(__dirname, "..", "frontend", "src", "contracts");
  fs.mkdirSync(contractsDir, { recursive: true });

  fs.writeFileSync(
    path.join(contractsDir, "contract-address.json"),
    JSON.stringify({ LendingPlatform: lendingAddress }, null, 2)
  );

  const factory = await ethers.getContractFactory("LendingPlatform");
  const abi = JSON.parse(factory.interface.formatJson());

  fs.writeFileSync(
    path.join(contractsDir, "LendingPlatform.abi.json"),
    JSON.stringify(abi, null, 2)
  );

  console.log("Frontend contract files written to:", contractsDir);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
