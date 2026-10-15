// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {NotaryRegistry} from "../src/NotaryRegistry.sol";

/**
 * @title DeployNotaryRegistryScript
 * @notice Deploys the {NotaryRegistry} contract to Base Sepolia.
 * @dev Reads configuration from environment variables:
 *      - `PRIVATE_KEY`       deployer key used to broadcast the deployment.
 *      - `PROTOCOL_TREASURY` recipient of the 1-cent protocol fee share.
 *      - `ADMIN_ADDRESS`     address granted `DEFAULT_ADMIN_ROLE`.
 *      - `USDC_ADDRESS`      optional USDC override; defaults to the official Base Sepolia USDC.
 */
contract DeployNotaryRegistryScript is Script {
    /// @dev Official Circle USDC on Base Sepolia, used when `USDC_ADDRESS` is unset.
    address internal constant DEFAULT_USDC_ADDRESS = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    /**
     * @notice Deploys {NotaryRegistry} and logs the deployed address.
     */
    function run() external returns (NotaryRegistry registry) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address protocolTreasury = vm.envAddress("PROTOCOL_TREASURY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        IERC20 usdc = IERC20(vm.envOr("USDC_ADDRESS", DEFAULT_USDC_ADDRESS));

        vm.startBroadcast(deployerKey);
        registry = new NotaryRegistry(usdc, protocolTreasury, admin);
        vm.stopBroadcast();

        console2.log("NotaryRegistry deployed at:", address(registry));
    }
}
