// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { ERC20 } from "./token/ERC20/ERC20.sol";


contract USDC is ERC20 {
    constructor(uint256 initialSupply) ERC20("USDC", "USDC") {
        _mint(_msgSender(), initialSupply);
    }
}