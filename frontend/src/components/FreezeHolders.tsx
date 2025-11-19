import React, { useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import * as splToken from '@solana/spl-token';
import { PublicKey, TransactionInstruction, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { AppConfig } from '../App';

interface FreezeHoldersProps {
  config: AppConfig;
  displayMessage: (message: string, type?: string) => void;
}

const FreezeHolders: React.FC<FreezeHoldersProps> = ({ config, displayMessage }) => {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [freezeStatus, setFreezeStatus] = useState<string>('');
  const [isFreezing, setIsFreezing] = useState<boolean>(false);
  
  interface TechConfig {
    tick: number;
    requestTick: number;
    chunkSize: number;
  }
  const techConfig: TechConfig = {
    tick: 500,
    requestTick: 2000,
    chunkSize: 25,
  };

  const getRaydiumAuthorities = (cluster: 'mainnet-beta' | 'devnet') => {
    if (cluster === 'mainnet-beta') {
      return [
        "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
        "GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL"
      ];
    } else {
      return [
        "3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR",
        "HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8",
        "CXniRufdq5xL8t8jZAPxsPZDpuudwuJSPWnbcD5Y5Nxq"
      ];
    }
  };

  const raydiumAuthority: string[] = getRaydiumAuthorities('devnet');

  let quoteTokenVault: PublicKey | null = null;
  let poolType: string = "Unknown";
  let listenerId: number | null = null;
  let updateCounter: number = 0;

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  interface HoldersData {
    tokenAccounts: string[];
    quoteTokenVault: PublicKey | null;
    poolType: string;
  }

  const getHoldersData = async (
    currentConfig: AppConfig,
    mintAddressPublicKey: PublicKey,
    decimals: number
  ): Promise<HoldersData> => {
    try {
      let tokenAccounts = new Set<string>();

      const accounts = await connection.getProgramAccounts(
        splToken.TOKEN_2022_PROGRAM_ID,
        {
          commitment: "confirmed",
          filters: [
            { memcmp: { offset: 0, bytes: mintAddressPublicKey.toBase58() } }
          ]
        }
      );
      console.log(`Fetched ${accounts.length} token accounts for mint ${mintAddressPublicKey.toBase58()}`);

      for (const { pubkey, account } of accounts) {
        try {
          const data = splToken.AccountLayout.decode(account.data);
          const mint = new PublicKey(data.mint);
          const owner = new PublicKey(data.owner).toBase58();
          const amount = Number(data.amount);
          const state = data.state;
          console.log(`Processing account ${pubkey.toBase58()}: owner=${owner}, amount=${amount}, state=${state}`);

          // Check for Raydium liquidity pool vaults
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
            !currentConfig.whitelist.includes(owner) &&
            amount >= currentConfig.freezeThreshold * (10 ** decimals)
          ) {
            tokenAccounts.add(pubkey.toBase58());
          }
        } catch (innerError: any) {
          console.warn(`⚠️ Skipping invalid token account: ${pubkey.toBase58()}`);
          continue;
        }
      }

      return { tokenAccounts: Array.from(tokenAccounts), quoteTokenVault, poolType };
    } catch (error: any) {
      displayMessage(`Error while fetching token account data: ${error.message}`, 'error');
      console.error(error);
      return { tokenAccounts: [], quoteTokenVault: null, poolType: "Unknown" };
    }
  };

  const freezeHolders = async (
    currentConfig: AppConfig,
    mintAddressPublicKey: PublicKey,
    decimals: number
  ): Promise<void> => {
    if (!publicKey) return; // Add null check for publicKey

    const { tokenAccounts, quoteTokenVault: vault, poolType: pool } = await getHoldersData(currentConfig, mintAddressPublicKey, decimals);
    quoteTokenVault = vault;
    poolType = pool;

    if (!Array.isArray(tokenAccounts)) {
      displayMessage("Error: getHoldersData did not return an array!", 'error');
      return;
    }

    const CHUNK_SIZE = techConfig.chunkSize;
    const PRIORITY_RATE = currentConfig.priorityRate;

    if (tokenAccounts.length > 0) {
      displayMessage(`Found ${tokenAccounts.length} accounts to freeze.`, 'info');
      for (let i = 0; i < tokenAccounts.length; i += CHUNK_SIZE) {
        const chunk = tokenAccounts.slice(i, i + CHUNK_SIZE);
        let transactions = new Transaction();

        for (let j = 0; j < chunk.length; j++) {
          let tokenAccountPublicKey = new PublicKey(chunk[j]);
          const instruction = new TransactionInstruction({
            keys: [
              { pubkey: tokenAccountPublicKey, isSigner: false, isWritable: true },
              { pubkey: mintAddressPublicKey, isSigner: false, isWritable: false },
              { pubkey: publicKey as PublicKey, isSigner: true, isWritable: false }, // Cast publicKey
            ],
            programId: splToken.TOKEN_PROGRAM_ID,
            data: Buffer.from(new Uint8Array([10])) // Cast to Buffer
          });
          transactions.add(instruction);
        }

        if (PRIORITY_RATE > 0) {
          const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_RATE });
          transactions.add(priorityFeeInstruction);
        }

        try {
          transactions.feePayer = publicKey as PublicKey; // Cast publicKey
          transactions.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          
          // This would need to be signed by the wallet, which requires a modified approach
          // For now, we'll display the transaction for signing
          displayMessage(`✅︎ Prepared freeze transaction for ${chunk.length} accounts.`, 'success');
        } catch (error: any) { // Cast error to any
          displayMessage(`❌ Error occurred when trying to freeze holders: ${error.message}`, 'error');
          console.error(error);
          if (listenerId) {
            connection.removeAccountChangeListener(listenerId);
          }
          throw error;
        }
      }
    } else {
      displayMessage(`No accounts to freeze found for mint ${currentConfig.mintAddress}. Keep pending on new transactions.`, 'info');
    }
  };

  const handleStartFreeze = async () => {
    if (!publicKey) {
      displayMessage('Please connect your wallet first.', 'error');
      return;
    }

    if (!config.mintAddress || config.mintAddress === "4ymjEVRokyipGDxwgkNez3cvMqwnkL5n3jM7zThsmC41") {
      displayMessage('Please create a token or set a valid mint address in the configuration.', 'error');
      return;
    }

    setIsFreezing(true);
    setFreezeStatus('Starting freeze script...');
    displayMessage('Starting freeze script...', 'info');

    try {
      const MIN_DELAY_BETWEEN_FREEZE = config.freezeDelay;
      const TIMEOUT = config.timeout;

      const mintAddressPublicKey = new PublicKey(config.mintAddress);

      let mintDataJSON = await connection.getParsedAccountInfo(mintAddressPublicKey);
      if (mintDataJSON.value === null) {
        displayMessage(`❌ Invalid data at "mintAddress" field: Could not find mint account.`, 'error');
        setIsFreezing(false);
        return;
      }

      const mintData = mintDataJSON.value.data;
      if (typeof mintData === 'object' && 'parsed' in mintData && mintData.parsed.type === "mint") {
        const mintInfo = mintData.parsed.info;

        if (mintInfo.freezeAuthority === publicKey.toBase58()) {
          // OK
        } else if (mintInfo.freezeAuthority === null) {
          displayMessage(`❌ Provided token has Freeze Authority revoked!`, 'error');
          setIsFreezing(false);
          return;
        } else {
          displayMessage(`❌ Connected wallet doesn't have freeze authority for this token.`, 'error');
          setIsFreezing(false);
          return;
        }

        const decimals = mintInfo.decimals;

      let updatedWhitelist = [...config.whitelist];
      raydiumAuthority.forEach(authority => {
        if (!updatedWhitelist.includes(authority)) {
          updatedWhitelist.push(authority);
        }
      });
      if (!updatedWhitelist.includes(publicKey.toBase58())) {
        updatedWhitelist.push(publicKey.toBase58());
      }

      setFreezeStatus("⏳ Performing an initial freeze loop...");
      displayMessage("Performing an initial freeze loop...", 'info');

      const tempConfig = { ...config, whitelist: updatedWhitelist };
      await freezeHolders(tempConfig, mintAddressPublicKey, decimals);

      if (quoteTokenVault !== null) {
        setFreezeStatus(`💧✅ ${poolType} liquidity pool found! Monitoring for new transactions.`);
        displayMessage(`💧✅ ${poolType} liquidity pool found! Monitoring for new transactions.`, 'success');

        listenerId = connection.onAccountChange(
          quoteTokenVault,
          async () => {
            updateCounter++;
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
            setFreezeStatus("⏳ TIMEOUT: Script execution stopped.");
            displayMessage("TIMEOUT: Script execution stopped.", 'info');
            setIsFreezing(false);
            return;
          }

          if (updateCounter !== 0 && Date.now() > timestampToFreeze) {
            updateCounter = 0;
            await sleep(techConfig.requestTick);
            setFreezeStatus("⏳ Performing freeze loop...");
            displayMessage("Performing freeze loop...", 'info');
            await freezeHolders(tempConfig, mintAddressPublicKey, decimals);
            timestampToFreeze = Date.now() + MIN_DELAY_BETWEEN_FREEZE * 1000;
          }
        }, techConfig.tick);
      } else {
        setFreezeStatus(`💧❌ No Raydium liquidity pool found for given token.`);
        displayMessage(`💧❌ No Raydium liquidity pool found for given token. Create a Standard AMM or Legacy AMM v4 pool at Raydium and provide liquidity.`, 'error');
        setIsFreezing(false);
      }
    }
  }catch (error: any) {
      displayMessage(`Failed to start freeze script: ${error.message}`, 'error');
      console.error(error);
      setIsFreezing(false);
    }
  };

  return (
    <section id="freeze-functionality">
      <h2>Freeze Holders</h2>
      <button onClick={handleStartFreeze} disabled={isFreezing}>
        {isFreezing ? 'Freezing...' : 'Start Freeze Script'}
      </button>
      <p id="freeze-status">{freezeStatus}</p>
    </section>
  );
};

export default FreezeHolders;
