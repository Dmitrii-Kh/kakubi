const MerkleTree = require("merkletreejs").MerkleTree;
const keccak256 = require("keccak256");
const ethers = require("ethers");

function encodeLeaf(index, address, amount) {
	// Same as `abi.encodePacked` in Solidity
	return ethers.utils.solidityPack(
	  ["uint256", "address", "uint256"],
	  [index, address, amount]
	);
}

function buildMerkleTree(accounts) {
	const leaves = [];

	for (const [index, account] of accounts.entries()) {
		leaves.push(encodeLeaf(index, account.address, account.amount));
	}

	return new MerkleTree(leaves, keccak256, {
		hashLeaves: true,
		sortPairs: true,
	});
}

module.exports = {
    buildMerkleTree,
}
