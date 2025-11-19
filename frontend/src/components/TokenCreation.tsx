import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  SystemProgram,
  Transaction,
  Keypair
} from "@solana/web3.js";

import {
  ExtensionType,
  createInitializeMintInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferFeeConfigInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getMintLen,
  TYPE_SIZE,
  LENGTH_SIZE,
  createInitializeInstruction,
} from "@solana/spl-token";

import { AppConfig } from "../App"; // Adjust if needed

interface TokenCreationProps {
  config: AppConfig;
  updateConfig: (updates: Partial<AppConfig>) => void;
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
      // 1️⃣ Generate mint & authorities
      // ----------------------------
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;

      const transferFeeAuthority = Keypair.generate();
      const withdrawWithheldAuthority = Keypair.generate();
      const decimals = tokenDecimals;
      const feeBasisPoints = 50;
      const maxFee = BigInt(5_000);

      // ----------------------------
      // 2️⃣ Calculate rent
      // ----------------------------
      const metadataLen = TYPE_SIZE + LENGTH_SIZE + 200; // rough estimate
      const mintLen = getMintLen(extensions);
      const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen + metadataLen);

      // ----------------------------
      // 3️⃣ Build transaction
      // ----------------------------
      const tx = new Transaction().add(
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
          name: tokenName,
          symbol: tokenSymbol,
          uri: "https://example.com/metadata.json",
          mintAuthority: publicKey,
          updateAuthority: publicKey,
        })
      );

      // ----------------------------
      // 4️⃣ Send transaction
      // ----------------------------
      const signature = await sendTransaction(tx, connection, { 
        signers: [mintKeypair] 
      });
      
    
      display(`Mint created: ${mint.toBase58()}`, "success");

      // ----------------------------
      // 5️⃣ Create associated token account & mint tokens
      // ----------------------------
      // Get the associated token account address (deterministic, no keypair needed)
      const associatedTokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      // Build transaction with create ATA + mint instructions
      const mintTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          publicKey, // payer
          associatedTokenAccount, // associated token account
          publicKey, // owner
          mint, // mint
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

      // No additional signers needed! ATA is deterministic
      const mintSignature = await sendTransaction(mintTx, connection);
      

      display(`Minted ${tokenSupply} tokens to ${associatedTokenAccount.toBase58()}`, "success");

      // ----------------------------
      // 6️⃣ Update state
      // ----------------------------
      setNewMintAddress(mint.toBase58());
      updateConfig({ 
        ...config, 
        mintAddress: mint.toBase58(),
        // tokenAccountAddress: associatedTokenAccount.toBase58() // Store ATA address
      });

    } catch (e: any) {
      console.error(e);
      display(e.message || String(e), "error");
    }

    setIsCreating(false);
  };

  return (
    <section>
      <h2>Create Token</h2>

      <input value={tokenName} placeholder="Name" onChange={(e) => setTokenName(e.target.value)} />
      <input value={tokenSymbol} placeholder="Symbol" onChange={(e) => setTokenSymbol(e.target.value)} />
      <input type="number" value={tokenDecimals} onChange={(e) => setTokenDecimals(Number(e.target.value))} />
      <input type="number" value={tokenSupply} onChange={(e) => setTokenSupply(Number(e.target.value))} />

      <button onClick={createToken} disabled={isCreating || !connected}>
        {isCreating ? "Creating…" : "Create Token"}
      </button>

      {newMintAddress && <p>Mint: {newMintAddress}</p>}
    </section>
  );
};

export default TokenCreation;