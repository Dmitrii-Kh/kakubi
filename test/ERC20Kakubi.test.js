const { expect } = require("chai");
const { buildMerkleTree } = require('../merkle-tree-utils');
const keccak256 = require("keccak256");

const zeroAddress = '0x0000000000000000000000000000000000000000';

let KakubiFactory, USDCFactory;
let KKB, USDC;
let owner, safe, beneficiary, addr1, addr2, addr3;
let addrs;
let accounts;
let tree;

function encodeLeaf(index, address, amount) {
	// Same as `abi.encodePacked` in Solidity
	return ethers.utils.solidityPack(
	  ["uint256", "address", "uint256"],
	  [index, address, amount]
	);
}

before(async function () {
    KakubiFactory = await ethers.getContractFactory("Kakubi");
    USDCFactory = await ethers.getContractFactory("USDC");
    [owner, addr1, addr2, addr3, safe, beneficiary, ...addrs] = await ethers.getSigners();

    accounts = [
        { address: owner.address, amount: "1000000000000000000000000"},
        { address: addr1.address, amount: "1000000000000000000000000"},
        { address: addr2.address, amount: "1000000000000000000000000"},
        { address: addr3.address, amount: "1000000000000000000000000"},
    ];
    tree = buildMerkleTree(accounts);

    KKB = await KakubiFactory.deploy(safe.address);
    USDC = await USDCFactory.deploy("1000000000000000000000000"); // 1 million USDC
});

describe("Setting merkle root and minting", function() {

    const topUpAmount = "4000000000000000000000000"; //4 million KKB

    it("Should set merkle root", async function() {
        const root = tree.getHexRoot();
        await expect(KKB.connect(safe).setRoot(root)).to.emit(KKB, 'RootChanged').withArgs(safe.address, root);
    });

    it("Should revert on setting merkle root", async function() {
        const root = tree.getHexRoot();
        await expect(KKB.connect(addr1).setRoot(root)).to.be.revertedWith('ERC20Kakubi: Called by account other than safe');
    });

    it("Should revert on minting", async function() {
        await expect (KKB.connect(owner).mint(topUpAmount)).to.be.revertedWith('ERC20Kakubi: Called by account other than safe');
        expect(await KKB.balanceOf(KKB.address)).to.equal(0);
    });

    it("Should mint", async function() {
        await KKB.connect(safe).mint(topUpAmount);
        expect(await KKB.balanceOf(KKB.address)).to.equal(topUpAmount);
    });
});

describe("Claiming", function() {

    it("Should claim amount", async function() {
        const index = 0;
        const account = accounts[index];
        const targetLeaf = encodeLeaf(index, account.address, account.amount);
        const targetLeafHash = keccak256(targetLeaf);
        const proof = tree.getHexProof(targetLeafHash);
        await expect(KKB.connect(owner).claim(index, account.amount, proof))
        .to.emit(KKB, 'Claimed').withArgs(index, owner.address, account.amount);
    });

    it("Should not claim twice", async function() {
        const index = 0;
        const account = accounts[index];
        const targetLeaf = encodeLeaf(index, account.address, account.amount);
        const targetLeafHash = keccak256(targetLeaf);
        const proof = tree.getHexProof(targetLeafHash, index)
        await expect(KKB.connect(owner).claim(index, account.amount, proof))
        .to.be.revertedWith('ERC20Kakubi: Drop already claimed')
    });

    it("Should not claim exceeding amount", async function() {
        const index = 1;
        const account = accounts[index];
        const amountToClaim = account.amount + 10000;
        const targetLeaf = encodeLeaf(index, account.address, amountToClaim);
        const targetLeafHash = keccak256(targetLeaf);
        const proof = tree.getHexProof(targetLeafHash, index)
        await expect(KKB.connect(addr1).claim(index, amountToClaim, proof))
        .to.be.revertedWith('ERC20Kakubi: Invalid proof')
    });

    it("Should not claim with invalid proof", async function() {
        const index = 1;
        const account = accounts[index];
        const amountToClaim = account.amount;
        const targetLeaf = encodeLeaf(index, account.address, amountToClaim);
        const targetLeafHash = keccak256(targetLeaf);
        const proof = tree.getHexProof(targetLeafHash);
        await expect(KKB.connect(owner).claim(index, amountToClaim, [proof[0]]))
        .to.be.revertedWith('ERC20Kakubi: Invalid proof')
    });

});


describe("Sending royalty", function() {
    const feeDenominator = 1000; // 0.1%

    it("Should not set beneficiary", async function() {
        await expect(KKB.connect(owner).setBeneficiaryAddress(beneficiary.address))
        .to.be.revertedWith('ERC20Kakubi: Called by account other than safe')
    })

    it("Should set beneficiary", async function() {
        await KKB.connect(safe).setBeneficiaryAddress(beneficiary.address);
        expect(await KKB.beneficiary()).to.equal(beneficiary.address);
    })

    it("Should not set fee", async function() {
        await expect(KKB.connect(owner).setFee(feeDenominator))
        .to.be.revertedWith('ERC20Kakubi: Called by account other than safe')
    })

    it("Should set fee", async function() {
        await KKB.connect(safe).setFee(feeDenominator);
        expect(await KKB.feeDenominator()).to.equal(feeDenominator);
    })

    it("Should transfer tokens between accounts and send royalty in KKB to beneficiary", async function() {
        const transferAmount = 1000000;
        const ownerFee = transferAmount / feeDenominator; 
        const recipientAmount = transferAmount - ownerFee;
  
        // transfer transferAmount tokens from owner to addr1
        await KKB.transfer(addr1.address, transferAmount);
        expect(await KKB.balanceOf(addr1.address)).to.equal(recipientAmount);
    
        expect(await KKB.balanceOf(beneficiary.address)).to.equal(ownerFee);
    });
});


describe("Burning tokens", function() {
    it("Should burn KKB", async function() {
        expect (await KKB.connect(safe).burn(100)).to.emit(KKB, 'Transfer').withArgs(owner.address, zeroAddress, 100);
    })

    it("Should revert on burning by addr1 (non-owner)", async function() {
        await expect(KKB.connect(addr1).burn(100)).to.be.revertedWith('ERC20Kakubi: Called by account other than safe');
    })
})


describe("Merkle Distributor utilities", function() {
    it("Should clear bit map word of claimed KKB", async function() {
        const index = 1;
        const account = accounts[index];
        const targetLeaf = encodeLeaf(index, account.address, account.amount);
        const targetLeafHash = keccak256(targetLeaf);
        const proof = tree.getHexProof(targetLeafHash);
        await expect(KKB.connect(addr1).claim(index, account.amount, proof)).to.emit(KKB, 'Claimed').withArgs(index, addr1.address, account.amount);
        await KKB.connect(safe).clearClaimedBitMapWord(0);
        expect (await KKB.isClaimed(0)).to.equal(false); // owner already claimed earlier
        expect (await KKB.isClaimed(1)).to.equal(false);
    })
})
