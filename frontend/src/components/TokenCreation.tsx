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
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;
      const decimals = tokenDecimals;
      const feeBasisPoints = 50;
      const maxFee = BigInt(5_000);

      display("Calculating space and rent...", "info");

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

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');

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

      tx.partialSign(mintKeypair);

      display("Creating mint...", "info");
      const signature = await sendTransaction(tx, connection);

      display("Confirming mint creation...", "info");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, 'confirmed');

      display(`✅ Mint created: ${mint.toBase58()}`, "success");

      const associatedTokenAccount = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const { blockhash: mintBlockhash, lastValidBlockHeight: mintLastValidBlockHeight } = 
        await connection.getLatestBlockhash('finalized');

      const mintTx = new Transaction({
        recentBlockhash: mintBlockhash,
        feePayer: publicKey
      });

      mintTx.add(
        createAssociatedTokenAccountInstruction(
          publicKey,
          associatedTokenAccount,
          publicKey,
          mint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(
          mint,
          associatedTokenAccount,
          publicKey,
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

      setNewMintAddress(mint.toBase58());
      updateConfig({ mintAddress: mint.toBase58() });

    } catch (e: any) {
      console.error("Token creation error:", e);
      
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
    <section className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Create Token-2022</h2>

      <div className="flex flex-col gap-4 max-w-md">
        <input 
          value={tokenName} 
          placeholder="Token Name (e.g., My Token)" 
          onChange={(e) => setTokenName(e.target.value)} 
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        <input 
          value={tokenSymbol} 
          placeholder="Symbol (e.g., MTK)" 
          onChange={(e) => setTokenSymbol(e.target.value)} 
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        <input 
          type="number" 
          value={tokenDecimals} 
          onChange={(e) => setTokenDecimals(Number(e.target.value))} 
          placeholder="Decimals (default: 9)"
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        
        <input 
          type="number" 
          value={tokenSupply} 
          onChange={(e) => setTokenSupply(Number(e.target.value))} 
          placeholder="Initial Supply"
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button 
          onClick={createToken} 
          disabled={isCreating || !connected}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {isCreating ? "Creating…" : "Create Token"}
        </button>
      </div>

      {newMintAddress && (
        <div className="mt-6 p-4 bg-gray-700 rounded-lg">
          <strong className="text-white">Mint Address:</strong> 
          <p className="text-sm text-gray-300 break-all mt-1">{newMintAddress}</p>
        </div>
      )}
    </section>
  );
};

export default TokenCreation;