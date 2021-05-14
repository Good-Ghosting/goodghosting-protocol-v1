#!/usr/bin/env node

const { create } = require("ipfs-http-client");
const shell = require("shelljs");
const path = require("path");
const log = console.log;


function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}   

async function main(){
    const ipfs = create({
        host:"ipfs.infura.io",
        port: "5001",
        protocol: "https"
    });

    const artifactPaths = shell.ls("./build/contracts/*.json");

    log("Uploading sources & metadata to IPFS (Infura Gateway)...");
    log("========================================================");

    for (let _path of artifactPaths) {
        const artifact = require(path.join(process.cwd(), _path));

        log();
        log(artifact.contractName);
        log("-".repeat(artifact.contractName.length));

        const metadataResponse = await ipfs.add(artifact.metadata);
        log(`metadata: ${metadataResponse.path}`);
        await sleep(1000); // workaround to postpone rate limiting

        const sourceResponse = await ipfs.add(artifact.source);
        log(`source: ${sourceResponse.path}`);
        await sleep(1000);
    }

    log();
    log("Finished.");
    log();
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        console.log(err);
        process.exit(1);
    });