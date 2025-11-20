// TokenCreationWithMetaplexFixed.tsx
import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";

import {
  ExtensionType,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMetadataPointerInstruction,
  createInitializeTransferFeeConfigInstruction,
} from "@solana/spl-token";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createV1,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";

import {
  percentAmount,
  publicKey as metaplexPublicKey,
} from "@metaplex-foundation/umi";

import { AppConfig } from "../../pages/index";

interface TokenCreationProps {
  config: AppConfig;
  updateConfig: (updates: Partial<AppConfig>) => void;
  saveConfig: () => void;
  displayMessage: (message: string, type?: string) => void;
}

const extensions = [
  ExtensionType.TransferFeeConfig
];

const TokenCreation: React.FC<TokenCreationProps> = ({
  config,
  updateConfig,
  displayMessage,
}) => {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [tokenDecimals, setTokenDecimals] = useState<number>(9);
  const [tokenSupply, setTokenSupply] = useState<number>(1_000_000);
  const [tokenImage, setTokenImage] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newMintAddress, setNewMintAddress] = useState<string>("");

  const wallet = useWallet();
  const umi = createUmi(connection.rpcEndpoint)
    .use(walletAdapterIdentity(wallet))
    .use(mplTokenMetadata())
    .use(mplToolbox());

  const display = (msg: string, type: string = "info") => {
    try {
      displayMessage(msg, type);
    } catch {
      console.log(msg);
    }
  };

  const createToken = async () => {
    if (!publicKey || !connected)
      return display("Connect wallet first", "error");
    if (!tokenName.trim() || !tokenSymbol.trim())
      return display("Name + Symbol required", "error");

    setIsCreating(true);

    try {
      // --- 1) Upload image & metadata to Pinata ---
      let imageUrl = "";
      if (tokenImage) {
        display("Uploading image to IPFS...", "info");
        const formData = new FormData();
        formData.append("file", tokenImage, tokenImage.name);
        const res = await fetch(
          "https://api.pinata.cloud/pinning/pinFileToIPFS",
          {
            method: "POST",
            headers: {
              pinata_api_key: process.env.NEXT_PUBLIC_PINATA_KEY!,
              pinata_secret_api_key: process.env.NEXT_PUBLIC_PINATA_SECRET!,
            } as any,
            body: formData,
          }
        );
        const data = await res.json();
        if (res.status !== 200)
          throw new Error(data.error || "IPFS upload failed");
        imageUrl = `https://ipfs.io/ipfs/${data.IpfsHash}`;
      }

      const metadataJson = {
        name: tokenName,
        symbol: tokenSymbol,
        description: "Only Possible On Solana",
        image: imageUrl,
      };

      const metadataFile = new File(
        [JSON.stringify(metadataJson)],
        "metadata.json",
        {
          type: "application/json",
        }
      );
      const formData = new FormData();
      formData.append("file", metadataFile, "metadata.json");
      const res = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: {
            pinata_api_key: process.env.NEXT_PUBLIC_PINATA_KEY!,
            pinata_secret_api_key: process.env.NEXT_PUBLIC_PINATA_SECRET!,
          } as any,
          body: formData,
        }
      );
      const metadataData = await res.json();
      if (res.status !== 200)
        throw new Error(metadataData.error || "Metadata upload failed");
      const metadataUri = `https://gateway.pinata.cloud/ipfs/${metadataData.IpfsHash}`;

      display("✅ Metadata uploaded", "success");

      // --- 2) Create mint with extensions ---
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;
      const decimals = tokenDecimals;
      const feeBasisPoints = 50;
      const maxFee = BigInt(5_000);
      
      const mintLen = getMintLen(extensions);
      const mintLamports = await connection.getMinimumBalanceForRentExemption(
        mintLen
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("finalized");

      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: publicKey,
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
      
        createInitializeMintInstruction(
          mint,
          decimals,
          publicKey,
          publicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );

      display("Creating mint on-chain...", "info");
      
      // FIX: Correct signing order - sign all at once
      tx.sign(mintKeypair);
      
      if (!wallet.signTransaction) {
        throw new Error("Wallet does not support transaction signing");
      }
      
      const signedTx = await wallet.signTransaction(tx);
      const rawTransaction = signedTx.serialize();
      const sig = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      display(`✅ Mint created: ${mint.toBase58()}`, "success");

      // --- 3) Create Metaplex metadata ---
      const mint_address = metaplexPublicKey(mint.toBase58());
      
      // Get fresh blockhash for metadata transaction
      const {
        blockhash: metaBlockhash,
        lastValidBlockHeight: metaLastValidBlockHeight,
      } = await connection.getLatestBlockhash("finalized");
      
      const metadataTx = new Transaction({
        recentBlockhash: metaBlockhash,
        feePayer: publicKey,
      }).add(
        ...createV1(umi, {
          mint: mint_address,
          authority: umi.identity,
          payer: umi.identity,
          updateAuthority: umi.identity,
          name: metadataJson.name,
          symbol: metadataJson.symbol,
          uri: metadataUri,
          sellerFeeBasisPoints: percentAmount(0.0),
          tokenStandard: TokenStandard.Fungible,
        })
          .getInstructions()
          .map(toWeb3JsInstruction)
      );

      display("Creating Metaplex metadata on-chain...", "info");

      // FIX: Correct signing order - sign all at once
      metadataTx.sign(mintKeypair);
      
      if (!wallet.signTransaction) {
        throw new Error("Wallet does not support transaction signing");
      }
      
      const signedMetaTx = await wallet.signTransaction(metadataTx);
      const rawMetaTransaction = signedMetaTx.serialize();
      const msig = await connection.sendRawTransaction(rawMetaTransaction, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      
      await connection.confirmTransaction(
        { signature: msig, blockhash: metaBlockhash, lastValidBlockHeight: metaLastValidBlockHeight },
        "confirmed"
      );

      display(`✅ Metaplex metadata created`, "success");

      // --- 4) Create ATA & mint tokens ---
      const ata = getAssociatedTokenAddressSync(
        mint,
        publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const {
        blockhash: mintBlockhash,
        lastValidBlockHeight: mintLastValidBlockHeight,
      } = await connection.getLatestBlockhash("finalized");

      const mintTx = new Transaction({
        recentBlockhash: mintBlockhash,
        feePayer: publicKey,
      });
      
      mintTx.add(
        createAssociatedTokenAccountInstruction(
          publicKey,
          ata,
          publicKey,
          mint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        ),
        createMintToInstruction(
          mint,
          ata,
          publicKey,
          BigInt(tokenSupply) * BigInt(10 ** decimals),
          [],
          TOKEN_2022_PROGRAM_ID
        )
      );

      const mintSig = await sendTransaction(mintTx, connection);
      await connection.confirmTransaction(
        {
          signature: mintSig,
          blockhash: mintBlockhash,
          lastValidBlockHeight: mintLastValidBlockHeight,
        },
        "confirmed"
      );
      display(`✅ Minted ${tokenSupply} tokens to your wallet`, "success");

      setNewMintAddress(mint.toBase58());
      updateConfig({ mintAddress: mint.toBase58() });
    } catch (err: any) {
      console.error("Token creation error:", err);
      
      // Better error logging
      if (err.logs) {
        console.error("Transaction logs:", err.logs);
      }
      
      display(err.message || String(err), "error");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">
        Create Token-2022 + Metaplex Metadata
      </h2>

      <div className="flex flex-col gap-4 max-w-md">
        <input
          value={tokenName}
          placeholder="Token Name"
          onChange={(e) => setTokenName(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={tokenSymbol}
          placeholder="Symbol"
          onChange={(e) => setTokenSymbol(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          value={tokenDecimals}
          onChange={(e) => setTokenDecimals(Number(e.target.value))}
          placeholder="Decimals"
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="number"
          value={tokenSupply}
          onChange={(e) => setTokenSupply(Number(e.target.value))}
          placeholder="Initial Supply"
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Token Image (Optional)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setTokenImage(e.target.files ? e.target.files[0] : null)
            }
            className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 w-full file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

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
          <p className="text-sm text-gray-300 break-all mt-1">
            {newMintAddress}
          </p>
        </div>
      )}
    </section>
  );
};

export default TokenCreation;