// TokenCreationWithMetaplexFixed.tsx
import React, { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { AppConfig } from "../../pages/index";

interface TokenCreationProps {
  config: AppConfig;
  updateConfig: (updates: Partial<AppConfig>) => void;
  saveConfig: () => void;
  displayMessage: (message: string, type?: string) => void;
}

const TokenCreation: React.FC<TokenCreationProps> = ({
  config,
  updateConfig,
  displayMessage,
}) => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection(); // Although not used directly after refactor, keep for context or future use.

  const [tokenName, setTokenName] = useState<string>("");
  const [tokenSymbol, setTokenSymbol] = useState<string>("");
  const [tokenDecimals, setTokenDecimals] = useState<number>(9);
  const [tokenSupply, setTokenSupply] = useState<number>(1_000_000);
  const [tokenImage, setTokenImage] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newMintAddress, setNewMintAddress] = useState<string>("");

  const display = (msg: string, type: string = "info") => {
    try {
      displayMessage(msg, type);
    } catch {
      console.log(msg);
    }
  };

  const createToken = async () => {
    if (!tokenName.trim() || !tokenSymbol.trim())
      return display("Name + Symbol required", "error");

    const tokenAuthorityPubkey = process.env.NEXT_PUBLIC_FREEZE_AUTHORITY_PUBKEY;
    if (!tokenAuthorityPubkey) {
      display("❌ Token Authority Public Key not found in environment variables. Please set NEXT_PUBLIC_FREEZE_AUTHORITY_PUBKEY.", "error");
      return;
    }

    setIsCreating(true);

    try {
      // --- 1) Upload image & metadata to Pinata (client-side) ---
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

      // --- 2) Call backend API to create token ---
      display("Calling backend to create token...", "info");

      const backendApiUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || ''; // Use empty string for relative path
      const createTokenResponse = await fetch(`${backendApiUrl}/api/create-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenName,
          tokenSymbol,
          tokenDecimals,
          tokenSupply,
          metadataUri,
          tokenAuthorityPubkey,
          payerPublicKey: publicKey?.toBase58(), // Pass connected wallet's public key for fee payment if needed, though backend will pay.
        }),
      });

      const createTokenResult = await createTokenResponse.json();

      if (!createTokenResponse.ok) {
        throw new Error(createTokenResult.error || "Backend token creation failed");
      }

      display(`✅ Token creation initiated by backend. Mint Address: ${createTokenResult.mintAddress}`, "success");
      setNewMintAddress(createTokenResult.mintAddress);
      updateConfig({ mintAddress: createTokenResult.mintAddress });
    } catch (err: any) {
      console.error("Token creation error:", err);
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
