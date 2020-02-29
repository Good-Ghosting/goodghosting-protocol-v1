import Web3 from "web3";
import ViralBank from "./contracts/ViralBank.json";

const options = {
  web3: {
    block: false,
    customProvider: new Web3("ws://localhost:8545"),
  },
  contracts: [ViralBank],
  events: {
    SimpleStorage: ["StorageSet"],
  },
};

export default options;
