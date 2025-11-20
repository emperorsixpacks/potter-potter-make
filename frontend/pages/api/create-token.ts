import { NextApiRequest, NextApiResponse } from 'next';
import {
  Keypair,
  PublicKey,
  Transaction,
  Connection,
  SystemProgram,
} from '@solana/web3.js';
import * as splToken from '@solana/spl-token';
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createV1,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { mplToolbox } from "@metaplex-foundation/mpl-toolbox";
import { TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { percentAmount, signerIdentity, publicKey as metaplexPublicKey } from "@metaplex-foundation/umi";

const extensions = [splToken.ExtensionType.TransferFeeConfig];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tokenName, tokenSymbol, tokenDecimals, tokenSupply, metadataUri, tokenAuthorityPubkey, payerPublicKey } = req.body;

  if (!tokenName || !tokenSymbol || tokenDecimals === undefined || tokenSupply === undefined || !metadataUri || !tokenAuthorityPubkey) {
    return res.status(400).json({ error: 'Missing required token creation parameters.' });
  }

  // --- Securely load the private key from environment variables ---
  const privateKeyString = process.env.PRIVATE_KEY;
  if (!privateKeyString) {
    return res.status(500).json({ error: 'Server private key not configured. Set PRIVATE_KEY environment variable.' });
  }

  let secret: Uint8Array;
  try {
    secret = Uint8Array.from(privateKeyString.split(',').map(s => parseInt(s.trim(), 10)));
  } catch (parseError) {
    console.error('Error parsing private key:', parseError);
    return res.status(500).json({ error: 'Invalid PRIVATE_KEY format in environment variables.' });
  }

  const backendKeypair = Keypair.fromSecretKey(secret);
  const backendPublicKey = backendKeypair.publicKey;
  const connection = new Connection(process.env.NEXT_NETWORK!, 'confirmed'); // Assuming NEXT_NETWORK is set in .env

  try {
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    const decimals = tokenDecimals;
    const feeBasisPoints = 50;
    const maxFee = BigInt(5_000);

    const mintLen = splToken.getMintLen(extensions);
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: backendPublicKey, // Backend pays for mint creation
    });

    tx.add(
      SystemProgram.createAccount({
        fromPubkey: backendPublicKey, // Backend creates account
        newAccountPubkey: mint,
        space: mintLen,
        lamports: mintLamports,
        programId: splToken.TOKEN_2022_PROGRAM_ID,
      }),
      splToken.createInitializeTransferFeeConfigInstruction(
        mint,
        new PublicKey(tokenAuthorityPubkey),
        new PublicKey(tokenAuthorityPubkey),
        feeBasisPoints,
        maxFee,
        splToken.TOKEN_2022_PROGRAM_ID
      ),
      splToken.createInitializeMintInstruction(
        mint,
        decimals,
        new PublicKey(tokenAuthorityPubkey),
        new PublicKey(tokenAuthorityPubkey),
        splToken.TOKEN_2022_PROGRAM_ID
      )
    );

    // Sign with both the new mint's keypair and the backend's keypair
    tx.sign(mintKeypair);

      // --- 3) Create Metaplex metadata ---
      const umi = createUmi(connection.rpcEndpoint)
      .use(signerIdentity(backendKeypair)) 
      .use(mplTokenMetadata())
      .use(mplToolbox());
    // Backend signs the transaction
    const signature = await umi.rpc.sendTransaction(connection, tx);

  

    const mint_address = metaplexPublicKey(mint.toBase58());

    const {
      blockhash: metaBlockhash,
      lastValidBlockHeight: metaLastValidBlockHeight,
    } = await connection.getLatestBlockhash("finalized");

    const metadataTx = new Transaction({
      recentBlockhash: metaBlockhash,
      feePayer: backendPublicKey, // Backend pays for metadata creation
    }).add(
      ...createV1(umi, {
        mint: mint_address,
        authority: umi.identity,
        payer: umi.identity,
        updateAuthority: umi.identity,
        name: tokenName,
        symbol: tokenSymbol,
        uri: metadataUri,
        sellerFeeBasisPoints: percentAmount(0.0),
        tokenStandard: TokenStandard.Fungible,
      })
        .getInstructions()
        .map(toWeb3JsInstruction)
    );

    // Backend signs the metadata transaction
    const msig = await splToken.sendAndConfirmTransaction(connection, metadataTx, [backendKeypair]);

    // --- 4) Create ATA & mint tokens ---
    const recipientPublicKey = payerPublicKey ? new PublicKey(payerPublicKey) : backendPublicKey;

    const ata = splToken.getAssociatedTokenAddressSync(
      mint,
      recipientPublicKey,
      false,
      splToken.TOKEN_2022_PROGRAM_ID,
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const {
      blockhash: mintBlockhash,
      lastValidBlockHeight: mintLastValidBlockHeight,
    } = await connection.getLatestBlockhash("finalized");

    const mintTx = new Transaction({
      recentBlockhash: mintBlockhash,
      feePayer: backendPublicKey, // Backend pays for minting
    });
    
    mintTx.add(
      splToken.createAssociatedTokenAccountInstruction(
        backendPublicKey, // Payer
        ata,
        recipientPublicKey, // Owner
        mint,
        splToken.TOKEN_2022_PROGRAM_ID,
        splToken.ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      splToken.createMintToInstruction(
        mint,
        ata,
        backendPublicKey, // Mint authority (backend key)
        BigInt(tokenSupply) * BigInt(10 ** decimals),
        [],
        splToken.TOKEN_2022_PROGRAM_ID
      )
    );

    // Backend signs the mint transaction
    const mintSig = await splToken.sendAndConfirmTransaction(connection, mintTx, [backendKeypair]);

    res.status(200).json({ success: true, mintAddress: mint.toBase58(), signatures: [signature, msig, mintSig] });
  } catch (error: any) {
    console.error('Error in create-token API:', error);
    res.status(500).json({ error: error.message || 'Failed to create token via API' });
  }
}
