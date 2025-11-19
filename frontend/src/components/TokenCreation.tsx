import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import {
  ExtensionType,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TYPE_SIZE,
  LENGTH_SIZE,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferFeeConfigInstruction,
} from "@solana/spl-token";

import { pack, createInitializeInstruction, TokenMetadata } from "@solana/spl-token-metadata";
import { AppConfig } from '../App';

interface TokenCreationProps {
  config: AppConfig;
  updateConfig: (updates: Partial<AppConfig>) => void;
  saveConfig: () => void;
  displayMessage: (message: string, type?: string) => void;
}

const extensions = [ExtensionType.TransferFeeConfig, ExtensionType.MetadataPointer];

const TokenCreation: React.FC<TokenCreationProps> = ({ config, updateConfig, displayMessage }) => {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [tokenDecimals, setTokenDecimals] = useState<number>(9);
  const [tokenSupply, setTokenSupply] = useState<number>(1_000_000);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newMintAddress, setNewMintAddress] = useState<string>("");

  const display = (msg: string, type: string = "info") => {
    try { displayMessage(msg, type); }
    catch { console.log(msg); }
  };

  const createToken = async () => {
    if (!publicKey || !connected) return display("Connect wallet first", "error");
    if (!tokenName.trim() || !tokenSymbol.trim()) return display("Name + Symbol required", "error");

    setIsCreating(true);

    try {
      // ----------------------------
      // 1️⃣ Generate mint keypair
      // ----------------------------
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;
      const decimals = tokenDecimals;
      const feeBasisPoints = 50;
      const maxFee = BigInt(5_000);

      display("Calculating space and rent...", "info");

      // ----------------------------
      // 2️⃣ Calculate space and rent
      // ----------------------------
      const metadata: TokenMetadata = {
        mint,
        name: tokenName,
        symbol: tokenSymbol,
        uri: "https://example.com/metadata.json",
        additionalMetadata: [["description", "Only Possible On Solana"]],
      };

      const mintLen = getMintLen(extensions);
      const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
      const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

      // Get blockhash BEFORE building transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

      // ----------------------------
      // 3️⃣ Build mint creation transaction
      // ----------------------------
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKey
      });

      tx.add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mint,
          space: mintLen,
          lamports: mintLamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),

        createInitializeTransferFeeConfigInstruction(
          mint,
          publicKey,
          publicKey,
          feeBasisPoints,
          maxFee,
          TOKEN_2022_PROGRAM_ID
        ),

        createInitializeMetadataPointerInstruction(mint, publicKey, mint, TOKEN_2022_PROGRAM_ID),
        createInitializeMintInstruction(mint, decimals, publicKey, publicKey, TOKEN_2022_PROGRAM_ID),

        createInitializeInstruction({
          programId: TOKEN_2022_PROGRAM_ID,
          mint,
          metadata: mint,
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadata.uri,
          mintAuthority: publicKey,
          updateAuthority: publicKey,
        })
      );

      // PartialSign with mint keypair
      tx.partialSign(mintKeypair);

      // ----------------------------
      // 4️⃣ Send mint creation transaction
      // ----------------------------
      display("Creating mint...", "info");
      const signature = await sendTransaction(tx, connection);

      display("Confirming mint creation...", "info");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');

      display(`✅ Mint created: ${mint.toBase58()}`, "success");

      // ----------------------------
      // 5️⃣ Create ATA and mint tokens
      // ----------------------------
      const associatedTokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Get fresh blockhash for second transaction
      const { blockhash: mintBlockhash, lastValidBlockHeight: mintLastValidBlockHeight } = 
        await connection.getLatestBlockhash('finalized');

      const mintTx = new Transaction({
        recentBlockhash: mintBlockhash,
        feePayer: publicKey
      });

      mintTx.add(
        createAssociatedTokenAccountInstruction(
          publicKey, // payer
          associatedTokenAccount,
          publicKey, // owner
          mint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),

        createMintToInstruction(
          mint,
          associatedTokenAccount,
          publicKey, // mint authority
          BigInt(tokenSupply) * BigInt(10 ** tokenDecimals),
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      display("Minting tokens...", "info");
      const mintSignature = await sendTransaction(mintTx, connection);

      display("Confirming minting...", "info");
      await connection.confirmTransaction({
        signature: mintSignature,
        blockhash: mintBlockhash,
        lastValidBlockHeight: mintLastValidBlockHeight
      }, 'confirmed');

      display(`✅ Minted ${tokenSupply} ${tokenSymbol} to your wallet`, "success");

      // ----------------------------
      // 6️⃣ Update state
      // ----------------------------
      setNewMintAddress(mint.toBase58());
      updateConfig({ 
        ...config, 
        mintAddress: mint.toBase58(),
        // tokenAccountAddress: associatedTokenAccount.toBase58()
      });

    } catch (e: any) {
      console.error("Token creation error:", e);
      
      // Detailed error logging
      if (e.logs) {
        console.error("Transaction logs:", e.logs);
        display(`Error: ${e.logs.join('\n')}`, "error");
      } else {
        display(e.message || String(e), "error");
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section style={{ padding: "20px" }}>
      <h2>Create Token-2022</h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "400px" }}>
        <input 
          value={tokenName} 
          placeholder="Token Name (e.g., My Token)" 
          onChange={(e) => setTokenName(e.target.value)} 
          style={{ padding: "8px" }}
        />
        
        <input 
          value={tokenSymbol} 
          placeholder="Symbol (e.g., MTK)" 
          onChange={(e) => setTokenSymbol(e.target.value)} 
          style={{ padding: "8px" }}
        />
        
        <input 
          type="number" 
          value={tokenDecimals} 
          onChange={(e) => setTokenDecimals(Number(e.target.value))} 
          placeholder="Decimals (default: 9)"
          style={{ padding: "8px" }}
        />
        
        <input 
          type="number" 
          value={tokenSupply} 
          onChange={(e) => setTokenSupply(Number(e.target.value))} 
          placeholder="Initial Supply"
          style={{ padding: "8px" }}
        />

        <button 
          onClick={createToken} 
          disabled={isCreating || !connected}
          style={{ 
            padding: "12px", 
            backgroundColor: isCreating || !connected ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isCreating || !connected ? "not-allowed" : "pointer"
          }}
        >
          {isCreating ? "Creating…" : "Create Token"}
        </button>
      </div>

      {newMintAddress && (
        <div style={{ marginTop: "20px", padding: "10px", backgroundColor: "#f0f0f0", borderRadius: "4px" }}>
          <strong>Mint Address:</strong> 
          <p style={{ wordBreak: "break-all", fontSize: "12px" }}>{newMintAddress}</p>
        </div>
      )}
    </section>
  );
};

export default TokenCreation;