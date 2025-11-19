// script.js

// Embed initial config data
let config = {
    "privateKey": "2kUN9hN3g9wPVS31Jn9Ab7jcudDh7CuGVukCLoSYhZeZGAu3QEBkJPaHY7wv18wibGUAurJ5q33MBC685Xx96PBd",
    "rpcEndpoint": "https://devnet.helius-rpc.com/?api-key=2672dff0-a5c3-46c6-9426-863d32acd620",
    "mintAddress": "4ymjEVRokyipGDxwgkNez3cvMqwnkL5n3jM7zThsmC41",
    "freezeThreshold": 0,
    "freezeDelay": 0,
    "timeout": 180,
    "priorityRate": 25000,
    "whitelist": []
};

// Embed initial tech-config data
const techConfig = {
    "tick": 500,
    "requestTick": 2000,
    "chunkSize": 25,
    "showControls": true,
    "showDetailedErrors": false
};

// Load config from localStorage if available
if (localStorage.getItem('solanaTokenManagerConfig')) {
    config = JSON.parse(localStorage.getItem('solanaTokenManagerConfig'));
}

// Utility function to display messages
const messagesDiv = document.getElementById('messages');
function displayMessage(message, type = 'info') {
    const p = document.createElement('p');
    p.textContent = message;
    p.className = type;
    messagesDiv.prepend(p); // Add to top
    if (messagesDiv.children.length > 10) { // Keep only last 10 messages
        messagesDiv.removeChild(messagesDiv.lastChild);
    }
}

// Solana Web3 and SPL Token imports (from CDN)
// These will be loaded in the HTML head or dynamically if needed.
// For now, assume they are globally available or will be imported.
// Example: <script src="https://unpkg.com/@solana/web3.js@latest/lib/index.iife.js"></script>
// Example: <script src="https://unpkg.com/@solana/spl-token@latest/lib/index.iife.js"></script>

// Global variables
let provider; // Phantom wallet provider
let walletPublicKey; // Connected wallet's public key

// Global variables for freeze functionality
let mintAddressPublicKey;
let mintData;
let decimals;
let quoteTokenVault;
let poolType = "Unknown";
let listenerId;
let updateCounter = 0;

// Raydium authority addresses (hardcoded for now)
const raydiumAuthority = [
    "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1", // Raydium Authority V4
    "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL" // Raydium Vault Authority #2
];

// --- UI Element References ---
const connectWalletBtn = document.getElementById('connect-wallet');
const connectedAddressSpan = document.getElementById('connected-address');
const walletSelector = document.getElementById('wallet-selector'); // New wallet selector

const tokenNameInput = document.getElementById('token-name');
const tokenSymbolInput = document.getElementById('token-symbol');
const tokenDecimalsInput = document.getElementById('token-decimals');
const tokenSupplyInput = document.getElementById('token-supply');
const createTokenBtn = document.getElementById('create-token');
const newMintAddressSpan = document.getElementById('new-mint-address');

const configMintAddressInput = document.getElementById('config-mint-address');
const configFreezeThresholdInput = document.getElementById('config-freeze-threshold');
const configFreezeDelayInput = document.getElementById('config-freeze-delay');
const configPriorityRateInput = document.getElementById('config-priority-rate');
const saveConfigBtn = document.getElementById('save-config');

const whitelistDisplayUl = document.getElementById('whitelist-display');
const newWhitelistAddressInput = document.getElementById('new-whitelist-address');
const addToWhitelistBtn = document.getElementById('add-to-whitelist');

const startFreezeBtn = document.getElementById('start-freeze');
const freezeStatusP = document.getElementById('freeze-status');

// --- Functions to update UI from config ---
function updateConfigUI() {
    configMintAddressInput.value = config.mintAddress;
    configFreezeThresholdInput.value = config.freezeThreshold;
    configFreezeDelayInput.value = config.freezeDelay;
    configPriorityRateInput.value = config.priorityRate;
    updateWhitelistUI();
}

function updateWhitelistUI() {
    whitelistDisplayUl.innerHTML = '';
    config.whitelist.forEach(address => {
        const li = document.createElement('li');
        li.textContent = address;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = () => {
            config.whitelist = config.whitelist.filter(item => item !== address);
            saveConfig();
            updateWhitelistUI();
            displayMessage(`Removed ${address} from whitelist.`, 'info');
        };
        li.appendChild(removeBtn);
        whitelistDisplayUl.appendChild(li);
    });
}

// --- Save config to localStorage ---
function saveConfig() {
    localStorage.setItem('solanaTokenManagerConfig', JSON.stringify(config));
    displayMessage('Configuration saved to local storage.', 'success');
}

// --- Functions for freeze functionality (adapted from freeze.js) ---

const freezeHolders = async (connection, currentConfig, mintAddressPublicKey, decimals) => {
    const tokenAccounts = await getHoldersData(connection, currentConfig, mintAddressPublicKey, decimals) || [];
    if (!Array.isArray(tokenAccounts)) {
        displayMessage("Error: getHoldersData did not return an array!", 'error');
        return;
    }

    let chunkCount = 0;
    const CHUNK_SIZE = techConfig.chunkSize;
    const PRIORITY_RATE = currentConfig.priorityRate;

    if (tokenAccounts.length > 0) {
        displayMessage(\`Found \${tokenAccounts.length} accounts to freeze.\`, 'info');
        for (let i = 0; i < tokenAccounts.length; i += CHUNK_SIZE) {
            const chunk = tokenAccounts.slice(i, i + CHUNK_SIZE);
            chunkCount++;
            let transactions = new window.SolanaWeb3.Transaction();

            for (let j = 0; j < chunk.length; j++) {
                let tokenAccountPublicKey = new window.SolanaWeb3.PublicKey(chunk[j]);
                const instruction = new window.SolanaWeb3.TransactionInstruction({
                    keys: [
                        { pubkey: tokenAccountPublicKey, isSigner: false, isWritable: true },
                        { pubkey: mintAddressPublicKey, isSigner: false, isWritable: false },
                        { pubkey: walletPublicKey, isSigner: true, isWritable: false }, // Use connected wallet as signer
                    ],
                    programId: window.splToken.TOKEN_PROGRAM_ID,
                    data: new Uint8Array([10]) // Freeze instruction
                });
                transactions.add(instruction);
            }

            const priorityFeeInstruction = window.SolanaWeb3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });
            if (PRIORITY_RATE > 0) {
                transactions.add(priorityFeeInstruction);
            }

            let signature;

            try {
                // The connected wallet (provider) will sign the transaction
                signature = await window.SolanaWeb3.sendAndConfirmTransaction(
                    connection,
                    transactions,
                    [provider] // Use provider for signing
                );
                displayMessage(\`✅︎ Frozen \${chunk.length} accounts. Signature: \${signature}\`, 'success');

            } catch (error) {
                displayMessage(\`❌ Error occurred when trying to freeze holders: \${error.message}\`, 'error');
                console.error(error);
                if (listenerId) {
                    connection.removeAccountChangeListener(listenerId);
                }
                throw error; // Re-throw to stop the freezing process
            }
        }
    } else {
        displayMessage(\`No accounts to freeze found for mint \${currentConfig.mintAddress}. Keep pending on new transactions.\`, 'info');
    }
};

const getHoldersData = async (connection, currentConfig, mintAddressPublicKey, decimals) => {
    try {
        let allOwners = [];
        let tokenAccounts = new Set();

        const accounts = await connection.getProgramAccounts(
            window.splToken.TOKEN_PROGRAM_ID,
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
                const data = window.splToken.AccountLayout.decode(account.data);
                const mint = new window.SolanaWeb3.PublicKey(data.mint);
                const owner = new window.SolanaWeb3.PublicKey(data.owner).toBase58();
                const amount = Number(data.amount);
                const state = data.state;

                if (!quoteTokenVault) {
                    for (let i = 0; i < raydiumAuthority.length; i++) {
                        if (owner === raydiumAuthority[i]) {
                            quoteTokenVault = new window.SolanaWeb3.PublicKey(pubkey);
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
                    !currentConfig.whitelist.includes(owner) &&
                    amount >= currentConfig.freezeThreshold * (10 ** decimals)
                ) {
                    tokenAccounts.add(pubkey.toBase58());
                }

            } catch (innerError) {
                console.warn(\`⚠️ Skipping invalid token account: \${pubkey.toBase58()} (\${innerError.message})\`);
                // displayMessage(\`Skipping invalid token account: \${pubkey.toBase58()} (\${innerError.message})\`, 'warning');
                continue;
            }
        }

        // fs.writeFileSync for holders.json removed for browser compatibility

        return Array.from(tokenAccounts);
    } catch (error) {
        displayMessage(\`Error while fetching token account data: \${error.message}\`, 'error');
        console.error(error);
        return [];
    }
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    updateConfigUI(); // Initialize UI with current config
    // Removed auto-connect on DOMContentLoaded to allow user to select wallet
});

connectWalletBtn.addEventListener('click', async () => {
    const selectedWallet = walletSelector.value;
    if (!selectedWallet) {
        displayMessage('Please select a wallet to connect.', 'error');
        return;
    }

    let walletProvider;
    switch (selectedWallet) {
        case 'phantom':
            walletProvider = window.solana;
            break;
        case 'solflare':
            walletProvider = window.solflare;
            break;
        case 'backpack':
            walletProvider = window.backpack;
            break;
        default:
            displayMessage('Unknown wallet selected.', 'error');
            return;
    }

    if (!walletProvider) {
        displayMessage(`${selectedWallet} wallet not found. Please install it.`, 'error');
        // Optionally open installation link
        if (selectedWallet === 'phantom') window.open("https://phantom.app/", "_blank");
        if (selectedWallet === 'solflare') window.open("https://solflare.com/", "_blank");
        if (selectedWallet === 'backpack') window.open("https://backpack.app/", "_blank");
        return;
    }

    try {
        displayMessage(`Attempting to connect to ${selectedWallet} wallet...`, 'info');
        const resp = await walletProvider.connect();
        provider = walletProvider; // Set the global provider
        walletPublicKey = resp.publicKey;
        connectedAddressSpan.textContent = walletPublicKey.toBase58();
        displayMessage(`${selectedWallet} wallet connected successfully!`, 'success');
    } catch (err) {
        displayMessage(`${selectedWallet} wallet connection failed: ${err.message}`, 'error');
        console.error(`${selectedWallet} wallet connection failed:`, err);
    }
});

createTokenBtn.addEventListener('click', async () => {
    if (!walletPublicKey) {
        displayMessage('Please connect your wallet first.', 'error');
        return;
    }

    const tokenName = tokenNameInput.value.trim();
    const tokenSymbol = tokenSymbolInput.value.trim();
    const tokenDecimals = parseInt(tokenDecimalsInput.value);
    const tokenSupply = parseFloat(tokenSupplyInput.value);

    if (!tokenName || !tokenSymbol || isNaN(tokenDecimals) || isNaN(tokenSupply) || tokenDecimals < 0 || tokenSupply <= 0) {
        displayMessage('Please fill in all token creation fields with valid values.', 'error');
        return;
    }

    displayMessage('Creating new token...', 'info');
    createTokenBtn.disabled = true;

    try {
        const connection = new window.SolanaWeb3.Connection(config.rpcEndpoint, 'confirmed');
        const payer = provider.publicKey; // Use connected wallet as payer

        // Generate a new keypair for the mint authority (this will be the connected wallet)
        // For simplicity, the connected wallet will be the mint authority and freeze authority
        const mintAuthority = walletPublicKey;
        const freezeAuthority = walletPublicKey;

        const mint = await window.splToken.createMint(
            connection,
            provider.publicKey, // Payer
            mintAuthority,
            freezeAuthority,
            tokenDecimals
        );

        const tokenAccount = await window.splToken.getOrCreateAssociatedTokenAccount(
            connection,
            provider.publicKey, // Payer
            mint,
            walletPublicKey // Owner
        );

        await window.splToken.mintTo(
            connection,
            provider.publicKey, // Payer
            mint,
            tokenAccount.address,
            mintAuthority, // Minting authority
            tokenSupply * (10 ** tokenDecimals)
        );

        config.mintAddress = mint.toBase58();
        saveConfig();
        updateConfigUI();
        newMintAddressSpan.textContent = config.mintAddress;
        displayMessage(\`Token "\${tokenName}" created successfully! Mint Address: \${config.mintAddress}\`, 'success');

    } catch (error) {
        console.error('Token creation error:', error);
        displayMessage(\`Failed to create token: \${error.message}\`, 'error');
    } finally {
        createTokenBtn.disabled = false;
    }
});

saveConfigBtn.addEventListener('click', () => {
    config.freezeThreshold = parseInt(configFreezeThresholdInput.value);
    config.freezeDelay = parseInt(configFreezeDelayInput.value);
    config.priorityRate = parseInt(configPriorityRateInput.value);
    saveConfig();
    displayMessage('Configuration updated and saved.', 'success');
});

addToWhitelistBtn.addEventListener('click', () => {
    const address = newWhitelistAddressInput.value.trim();
    if (address) {
        try {
            new window.SolanaWeb3.PublicKey(address); // Validate address
            if (!config.whitelist.includes(address)) {
                config.whitelist.push(address);
                saveConfig();
                updateWhitelistUI();
                newWhitelistAddressInput.value = '';
                displayMessage(`Added ${address} to whitelist.`, 'success');
            } else {
                displayMessage('Address already in whitelist.', 'info');
            }
        } catch (error) {
            displayMessage('Invalid Solana address for whitelist.', 'error');
        }
    } else {
        displayMessage('Please enter an address to whitelist.', 'info');
    }
});

startFreezeBtn.addEventListener('click', async () => {
    if (!walletPublicKey) {
        displayMessage('Please connect your wallet first.', 'error');
        return;
    }
    if (!config.mintAddress || config.mintAddress === "4ymjEVRokyipGDxwgkNez3cvMqwnkL5n3jM7zThsmC41") { // Check for default or empty mint address
        displayMessage('Please create a token or set a valid mint address in the configuration.', 'error');
        return;
    }

    startFreezeBtn.disabled = true;
    freezeStatusP.textContent = 'Starting freeze script...';
    displayMessage('Starting freeze script...', 'info');

    try {
        const connection = new window.SolanaWeb3.Connection(config.rpcEndpoint, "confirmed");
        const MIN_DELAY_BETWEEN_FREEZE = config.freezeDelay;
        const TIMEOUT = config.timeout;
        const PRIORITY_RATE = config.priorityRate;

        mintAddressPublicKey = new window.SolanaWeb3.PublicKey(config.mintAddress);

        // Get mint data and decimals
        let mintDataJSON = await connection.getParsedAccountInfo(mintAddressPublicKey);
        if (mintDataJSON.value === null) {
            displayMessage(`❌ Invalid data at "mintAddress" field: Could not find mint account.`, 'error');
            startFreezeBtn.disabled = false;
            return;
        } else {
            mintData = mintDataJSON.value.data.parsed;
            if (!mintData || mintData.type != "mint") {
                displayMessage(`❌ Provided address is not a token!`, 'error');
                startFreezeBtn.disabled = false;
                return;
            }
            if (mintData.info.freezeAuthority === walletPublicKey.toBase58()) {
                // ok
            } else if (mintData.info.freezeAuthority === null) {
                displayMessage(`❌ Provided token has Freeze Authority revoked!`, 'error');
                startFreezeBtn.disabled = false;
                return;
            } else {
                displayMessage(`❌ Connected wallet doesn't have freeze authority for this token.`, 'error');
                startFreezeBtn.disabled = false;
                return;
            }
            decimals = mintData.info.decimals;
        }

        await processWhitelist(); // Update whitelist with Raydium authorities and connected wallet

        freezeStatusP.textContent = "⏳ Performing an initial freeze loop...";
        displayMessage("Performing an initial freeze loop...", 'info');
        await freezeHolders(connection, config, mintAddressPublicKey, decimals);

        if (quoteTokenVault != undefined) {
            freezeStatusP.textContent = `💧✅ ${poolType} liquidity pool found! Monitoring for new transactions.`;
            displayMessage(`💧✅ ${poolType} liquidity pool found! Monitoring for new transactions.`, 'success');

            listenerId = connection.onAccountChange(
                quoteTokenVault,
                async () => {
                    updateCounter++;
                    if (MIN_DELAY_BETWEEN_FREEZE > 0 && Date.now() + techConfig.tick * 2 < timestampToFreeze) {
                        displayMessage("🔔 New transaction spotted! Freeze can be triggered soon.", 'info');
                    }
                }
            );

            let launchTimestamp = Date.now();
            let timestampToFreeze = 0;

            const freezeLoopInterval = setInterval(async () => {
                if (Date.now() >= launchTimestamp + TIMEOUT * 60000) {
                    clearInterval(freezeLoopInterval);
                    if (listenerId) {
                        connection.removeAccountChangeListener(listenerId);
                    }
                    freezeStatusP.textContent = "⏳ TIMEOUT: Script execution stopped.";
                    displayMessage("TIMEOUT: Script execution stopped.", 'info');
                    startFreezeBtn.disabled = false;
                    return;
                }

                if (updateCounter !== 0 && Date.now() > timestampToFreeze) {
                    updateCounter = 0;
                    await sleep(techConfig.requestTick);
                    freezeStatusP.textContent = "⏳ Performing freeze loop...";
                    displayMessage("Performing freeze loop...", 'info');
                    await freezeHolders(connection, config, mintAddressPublicKey, decimals);
                    timestampToFreeze = Date.now() + MIN_DELAY_BETWEEN_FREEZE * 1000;
                }
            }, techConfig.tick); // Use techConfig.tick for interval
        } else {
            freezeStatusP.textContent = `💧❌ No Raydium liquidity pool found for given token.`;
            displayMessage(`💧❌ No Raydium liquidity pool found for given token. Create a Standard AMM or Legacy AMM v4 pool at Raydium and provide liquidity.`, 'error');
            startFreezeBtn.disabled = false;
        }

    } catch (error) {
        displayMessage(\`Failed to start freeze script: \${error.message}\`, 'error');
        console.error(error);
        startFreezeBtn.disabled = false;
    }
});

// Export config for debugging/console access if needed
window.appConfig = config;

// Helper sleep function
const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));
