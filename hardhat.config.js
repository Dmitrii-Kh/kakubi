require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-solhint");

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const ALCHEMY_API_KEY = "YOUR_API_KEY";
const RINKEBY_PRIVATE_KEY = "YOUR_PRIVATE_KEY";

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.14",
      },
      {
        version: "0.6.6",
        settings: {},
      }
    ],
  },
  networks: {
    hardhat: {
      chainId: 1111,
      allowUnlimitedContractSize: true
    },
    rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
      accounts: [`${RINKEBY_PRIVATE_KEY}`]
    }
  }
};
