// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/HighClassPong.sol";

contract DeployHighClassPong is Script {
    function run() external returns (HighClassPong pong) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);
        pong = new HighClassPong();
        vm.stopBroadcast();

        console.log("HighClassPong deployed at:", address(pong));
        console.log("Owner:", pong.owner());
        console.log("Chain ID:", block.chainid);
    }
}
