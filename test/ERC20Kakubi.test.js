const { expect } = require("chai");
const {
    abi: FACTORY_ABI,
    bytecode: FACTORY_BYTECODE,
} = require('@uniswap/v2-core/build/UniswapV2Factory.json');
const {
    abi: ROUTER_ABI,
    bytecode: ROUTER_BYTECODE,
} = require('@uniswap/v2-periphery/build/UniswapV2Router02.json');
const { abi: PAIR_ABI } = require('@uniswap/v2-core/build/IUniswapV2Pair.json')
const BN = require('bn.js');
const { buildMerkleTree } = require('../merkle-tree-utils');
const keccak256 = require("keccak256");

const zeroAddress = '0x0000000000000000000000000000000000000000';

let KakubiFactory, USDCFactory, UniswapFactory, RouterFactory, KakubiSwapFactory;
let KKB, USDC, UniswapV2Factory, UniswapV2Router02, KakubiSwap;
let owner, safe;
let addr1, addr2, addr3;
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
    UniswapFactory = await ethers.getContractFactory(FACTORY_ABI, FACTORY_BYTECODE);
    RouterFactory = await ethers.getContractFactory(ROUTER_ABI, ROUTER_BYTECODE);
    KakubiSwapFactory = await ethers.getContractFactory("KakubiSwap");
    [owner, addr1, addr2, addr3, safe, ...addrs] = await ethers.getSigners();

    accounts = [
        { address: owner.address, amount: "1000000000000000000000000"},
        { address: addr1.address, amount: "1000000000000000000000000"},
        { address: addr2.address, amount: "1000000000000000000000000"},
        { address: addr3.address, amount: "1000000000000000000000000"},
    ];
    tree = buildMerkleTree(accounts);

    UniswapV2Factory = await UniswapFactory.deploy(owner.address);
    UniswapV2Router02 = await RouterFactory.deploy(
        UniswapV2Factory.address,
        zeroAddress
    );

    KKB = await KakubiFactory.deploy(UniswapV2Router02.address, safe.address);
    USDC = await USDCFactory.deploy("1000000000000000000000000"); // 1 million USDC

    KakubiSwap = await KakubiSwapFactory.deploy(
        owner.address,
        KKB.address,
        USDC.address,
        UniswapV2Router02.address
    );

    await KKB.setSwapAddress(KakubiSwap.address);

});

describe("Setting merkle root and minting", function() {

    const topUpAmount = "4000000000000000000000000"; // 1 million KKB

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

    it("Should transfer tokens between accounts and send royalty in KKB to KakubiSwap", async function() {
        const transferAmount = 1000000;
        const ownerFee = transferAmount / 100; 
        const recipientAmount = transferAmount - ownerFee;
  
        // transfer transferAmount tokens from owner to addr1
        await KKB.transfer(addr1.address, transferAmount);
        expect(await KKB.balanceOf(addr1.address)).to.equal(transferAmount);
    
        // transfer transferAmount tokens from addr1 to addr2
        await KKB.connect(addr1).transfer(addr2.address, transferAmount);
        expect(await KKB.balanceOf(addr2.address)).to.equal(recipientAmount);
  
        expect(await KKB.balanceOf(KakubiSwap.address)).to.equal(ownerFee);
    });

    it("Should set ownerFee to 0", async function() {
        await KKB.setOwnerFee(0, 100);
        expect(await KKB.ownerFeeNumerator()).to.equal(0);
        expect(await KKB.ownerFeeDenominator()).to.equal(100);
    });

    it("Should transfer tokens between accounts and NOT send royalty", async function() {
        const addr1Balance = await KKB.balanceOf(addr1.address);
        const addr2Balance = await KKB.balanceOf(addr2.address);
        await KKB.connect(addr2).transfer(addr1.address, addr2Balance);
        expect(await KKB.balanceOf(addr1.address)).to.equal(addr1Balance + addr2Balance);
    })

  });


describe("Swapping royalty", function() {

    const kkbApproval =  "20000000000000000000";   // 20 KKB
    const usdcApproval = "100000000000000000000";  // 100 USDC
    let pairAddress;
    let pairContract;

    it("Should approve KKB and USDC for Router", async function() {
        expect(await KKB.approve(UniswapV2Router02.address, kkbApproval))
        .to.emit(KKB, 'Approve')
        .withArgs(owner.address, UniswapV2Router02.address, kkbApproval);

        expect(await USDC.approve(UniswapV2Router02.address, usdcApproval))
        .to.emit(USDC, 'Approve')
        .withArgs(owner.address, UniswapV2Router02.address, usdcApproval);
    });

    it("Should add liquidity", async function() {
      
        // getting timestamp
        const blockNumBefore = await ethers.provider.getBlockNumber();
        const blockBefore = await ethers.provider.getBlock(blockNumBefore);
        const timestampBefore = blockBefore.timestamp;
        const deadline = timestampBefore + 120;

        expect (await UniswapV2Router02.addLiquidity(
            KKB.address,
            USDC.address,
            kkbApproval,
            usdcApproval,
            kkbApproval,
            usdcApproval,
            owner.address,
            deadline
        )).to.emit(UniswapV2Router02, 'Mint')

        // log LP reserves
        // pairAddress = await UniswapV2Factory.getPair(KKB.address, USDC.address);
        // pairContract = await ethers.getContractAt(PAIR_ABI, pairAddress);
        // console.log(await pairContract.getReserves());
    });

    it("Should swap KKB to USDC", async function() {
        const swapperBalance = await USDC.balanceOf(addr1.address);
        const ownerBalance = await USDC.balanceOf(owner.address);
        const kakubiSwapContractBalance = await KKB.balanceOf(KakubiSwap.address);

        expect (await KakubiSwap.connect(addr1).swap()).to.emit(KakubiSwap, 'Swap')
        // console.log(await pairContract.getReserves());

        const amountOut = +(await UniswapV2Router02.getAmountsOut(
                kakubiSwapContractBalance,
                [KKB.address, USDC.address]
             )
            )[1];
        const tip = Math.floor(amountOut / 100);
        const ownersAmountOut = amountOut - tip; 

        // swapper and owner's USDC balances have been modified
        const newSwapperBalance = new BN(await USDC.balanceOf(addr1.address) + '');
        expect(newSwapperBalance.eq(new BN(swapperBalance+'').add(new BN(tip+'')))).to.equal(true);

        const newOwnersBalance = new BN(await USDC.balanceOf(owner.address) + '');
        expect(newOwnersBalance.eq(new BN(ownerBalance+'').add(new BN(ownersAmountOut+'')))).to.equal(true);

        // all KKB fee swapped
        expect(await KKB.balanceOf(KakubiSwap.address)).to.equal(0);
    });

 });

describe("Burning tokens", function() {
    it("Should burn KKB", async function() {
        expect (await KKB.connect(safe).burn(100)).to.emit(KKB, 'Transfer').withArgs(owner.address, zeroAddress, 100);
    })
    it("Should revert on burn by addr1 (non-owner)", async function() {
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
