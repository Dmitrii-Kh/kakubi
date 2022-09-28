async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
  
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const KakubiFactory = await ethers.getContractFactory("Kakubi");
    const KakubiSwapFactory = await ethers.getContractFactory("KakubiSwap");
    const USDCMerkleDistributorFactory = await ethers.getContractFactory("USDCMerkleDistributor");

    const UniswapV2Router02Address = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
    const USDCAddress = '';
    const SafeAddress = ''; 

    const KKB = await KakubiFactory.deploy(UniswapV2Router02Address, SafeAddress);
    const KakubiSwap = await KakubiSwapFactory.deploy(
        deployer.address,
        KKB.address,
        USDCAddress,
        UniswapV2Router02Address
    );
    const USDCMerkleDistributor = await USDCMerkleDistributorFactory.deploy(USDCAddress, SafeAddress);

    await KKB.setSwapAddress(KakubiSwap.address);

    console.log("KKB address:", KKB.address);
    console.log("KakubiSwap address:", KakubiSwap.address);
    console.log("USDCMerkleDistributor address:", USDCMerkleDistributor.address);
  }
  
main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
});


// npx hardhat run scripts/deploy.js --network rinkeby
