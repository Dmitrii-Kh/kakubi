async function main() {
    const [deployer] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    const KakubiFactory = await ethers.getContractFactory("Kakubi");
    const USDCMerkleDistributorFactory = await ethers.getContractFactory("USDCMerkleDistributor");

    const USDCAddress = '';
    const SafeAddress = ''; 

    const KKB = await KakubiFactory.deploy(SafeAddress);
    const USDCMerkleDistributor = await USDCMerkleDistributorFactory.deploy(USDCAddress, SafeAddress);

    console.log("KKB address:", KKB.address);
    console.log("USDCMerkleDistributor address:", USDCMerkleDistributor.address);
  }
  
main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
});


// npx hardhat run scripts/deploy.js --network rinkeby
