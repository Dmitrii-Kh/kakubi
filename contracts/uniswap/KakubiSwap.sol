// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import { IERC20 } from "../token/ERC20/IERC20.sol";

contract KakubiSwap {

    address private immutable KKB;
    address private immutable USDC;
    address private immutable kakubiWalletAddress;
    address private immutable UniswapV2Router02;

    event Swap(address from, uint256 output, uint256 tip);

    constructor(address payable _kakubiWalletAddress, address _kkbToken, address _tokenOut, address _UniswapV2Router02) {
        kakubiWalletAddress = _kakubiWalletAddress;
        KKB = _kkbToken;
        USDC = _tokenOut;
        UniswapV2Router02 = _UniswapV2Router02;
    }

    function swap() external {
        uint256 amountIn = IERC20(KKB).balanceOf(address(this));
        require(amountIn > 0, "Insufficient input amount");
        require(IERC20(KKB).approve(address(UniswapV2Router02), amountIn), "Approve failed!");

        address[] memory path = new address[](2);
        path[0] = KKB;
        path[1] = USDC;

        uint256 amountOutMin = _getAmountOutMin(KKB, USDC, amountIn);
        require(amountOutMin >= 100, "Insufficient output amount");

        IUniswapV2Router02(UniswapV2Router02).swapExactTokensForTokens(amountIn, amountOutMin, path, address(this), block.timestamp);

        uint256 output = IERC20(USDC).balanceOf(address(this));
        uint256 tip = output / 100;
        output -= tip;
        require(IERC20(USDC).transfer(msg.sender, tip), "Tip transfer failed!");
        require(IERC20(USDC).transfer(kakubiWalletAddress, output), "Swap output transfer failed!");
        emit Swap(msg.sender, output, tip);
    }

    function _getAmountOutMin(address _tokenIn, address _tokenOut, uint256 _amountIn) private view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = _tokenIn;
        path[1] = _tokenOut;
        uint256[] memory amountOutMins = IUniswapV2Router02(UniswapV2Router02).getAmountsOut(_amountIn, path);
        return amountOutMins[path.length -1];  
    }  
}
