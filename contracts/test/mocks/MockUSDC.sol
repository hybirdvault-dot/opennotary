// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Minimal 6-decimal ERC20 mock ("Mock USDC" / "USDC") with open minting for tests.
contract MockUSDC is ERC20 {
    /// @notice Creates the mock USDC token.
    constructor() ERC20("Mock USDC", "USDC") {}

    /// @notice Mints `amount` tokens to `to`.
    /// @dev Open minting is intended for test fixtures only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Returns 6 decimals, matching the real USDC token.
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
