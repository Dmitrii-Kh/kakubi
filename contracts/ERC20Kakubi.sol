// SPDX-License-Identifier: MIT
pragma solidity 0.8.14;

import { ERC20 } from "./token/ERC20/ERC20.sol";
import { Ownable } from "./ownership/ownable.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract Kakubi is ERC20, Ownable {

    uint128 public ownerFeeNumerator = 1;
    uint128 public ownerFeeDenominator = 100;
    address public kakubiSwap;
    address public router;
    bytes32 public merkleRoot;
    address public immutable kakubiSafe; 
    
    // Packed array of booleans.
    mapping(uint256 => uint256) private claimedBitMap;

    event Claimed(uint256 index, address account, uint256 amount);
    event RootChanged(address account, bytes32 merkleRoot);

    constructor(address _router, address _kakubiSafe) ERC20("Kakubi", "KKB") {
        router = _router;
        kakubiSafe = _kakubiSafe;
    }

    function mint(uint256 amount) external onlySafe {
        require(amount > 0, "ERC20Kakubi: Amount to mint is equal to 0");
        _mint(address(this), amount);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if(ownerFeeNumerator == 0 || _msgSender() == owner || recipient == owner || _msgSender() == address(this)) {
            _transfer(_msgSender(), recipient, amount);
            return true;
        }
        uint256 ownerFee = amount / ownerFeeDenominator * ownerFeeNumerator;
        amount -= ownerFee;
        _transfer(_msgSender(), kakubiSwap, ownerFee);
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        uint256 currentAllowance = _allowances[sender][_msgSender()];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: Transfer amount exceeds allowance");
            unchecked {
                _approve(sender, _msgSender(), currentAllowance - amount);
            }
        }
        if(ownerFeeNumerator == 0 || _msgSender() == router || sender == owner || recipient == owner  || _msgSender() == address(this)) {
            _transfer(sender, recipient, amount);
            return true;
        }
        uint256 ownerFee = amount / ownerFeeDenominator * ownerFeeNumerator;
        amount -= ownerFee;
        _transfer(sender, kakubiSwap, ownerFee);
        _transfer(sender, recipient, amount);
        return true;
    }

    function burn(uint256 value) external onlySafe { 
        _burn(owner, value);
    }

    function setSwapAddress(address _kakubiSwap) external onlyOwner {
        kakubiSwap = _kakubiSwap;
    }

    function setRouterAddress(address _router) external onlyOwner {
        router = _router;
    }

    function setOwnerFee(
        uint128 _ownerFeeNumerator, 
        uint128 _ownerFeeDenominator
    ) external onlyOwner {
        require(_ownerFeeDenominator > 0, "ERC20Kakubi: Denominator is equal to zero");
        ownerFeeNumerator = _ownerFeeNumerator;
        ownerFeeDenominator = _ownerFeeDenominator;
    }

    function setRoot(bytes32 _merkleRoot) external onlySafe {
        merkleRoot = _merkleRoot;
        emit RootChanged(_msgSender(), _merkleRoot);
    }

    // delete from 0 to maxIndex with 256 step
    function clearClaimedBitMapWord(uint256 index) external onlySafe {
        uint256 claimedWordIndex = index / 256;
        delete claimedBitMap[claimedWordIndex];
    }

    function isClaimed(uint256 index) public view returns (bool) {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        uint256 claimedWord = claimedBitMap[claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function _setClaimed(uint256 index) private {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        claimedBitMap[claimedWordIndex] = claimedBitMap[claimedWordIndex] | (1 << claimedBitIndex);
    }  

    function claim(uint256 index, uint256 amount, bytes32[] calldata merkleProof) external {
        require(!isClaimed(index), 'ERC20Kakubi: Drop already claimed');

        address account = _msgSender();

        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'ERC20Kakubi: Invalid proof');

        // Mark it claimed and send the token.
        _setClaimed(index);
        require(this.transfer(account, amount), "ERC20Kakubi: Transfer failed");
        emit Claimed(index, account, amount);
    }

    modifier onlySafe() {
        require(msg.sender == kakubiSafe, "ERC20Kakubi: Called by account other than safe");
        _;
    }
}