import Web3 from "web3";
import GoodGhosting from "./contracts/GoodGhosting.json";

const options = {
  web3: {
    block: false,
    customProvider: new Web3("ws://localhost:8545"),
  },
  contracts: [],
  events: {
  },
};

export default options;
