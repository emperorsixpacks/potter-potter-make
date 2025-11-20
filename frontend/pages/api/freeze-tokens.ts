import { NextApiRequest, NextApiResponse } from 'next';
import {
  Keypair,
  PublicKey,
  Transaction,
  Connection,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

// Helper to validate environment variables
function validateEnvVariables() {
  const privateKeyString = process.env.PRIVATE_KEY;
  if (!privateKeyString) {
    throw new Error('Server private key not configured. Set PRIVATE_KEY environment variable.');
  }

  const network = process.env.NEXT_NETWORK;
  if (!network) {
    throw new Error('Solana network not configured. Set NEXT_NETWORK environment variable.');
  }

  let secret: Uint8Array;
  try {
    // Check if the private key string is a hex string
    if (privateKeyString.match(/^[0-9a-fA-F]+$/) && privateKeyString.length % 2 === 0) {
      // Convert hex string to Uint8Array
      secret = new Uint8Array(privateKeyString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else {
      // Assume it's a comma-separated string of numbers
      secret = Uint8Array.from(privateKeyString.split(',').map(s => parseInt(s.trim(), 10)));
    }
  } catch (parseError) {
    console.error('Error parsing private key:', parseError);
    throw new Error('Invalid PRIVATE_KEY format in environment variables. Must be a comma-separated array of numbers or a single hexadecimal string.');
  }
  return { secret, network };
}

// Helper to validate request body
function validateRequestBody(body: NextApiRequest['body']) {
  const { tokenAccounts, mintAddress } = body;
  if (!tokenAccounts || !Array.isArray(tokenAccounts) || !mintAddress) {
    throw new Error('Missing required parameters: tokenAccounts and mintAddress');
  }
  return { tokenAccounts, mintAddress };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stopRequest, priorityRate } = req.body;

  if (stopRequest) {
    console.log("Freeze operation received a stop request.");
    return res.status(200).json({ success: true, message: "Freeze operation stopped by request." });
  }

  try {
    const { secret, network } = validateEnvVariables();
    const { tokenAccounts, mintAddress } = validateRequestBody(req.body);

    const keypair = Keypair.fromSecretKey(secret);
    const connection = new Connection(network!, 'confirmed');

    const mintAddressPublicKey = new PublicKey(mintAddress);
    const CHUNK_SIZE = 25; // This should ideally be configurable or match frontend

    let transactionSignatures: string[] = [];

    for (let i = 0; i < tokenAccounts.length; i += CHUNK_SIZE) {
      const chunk = tokenAccounts.slice(i, i + CHUNK_SIZE);
      let transaction = new Transaction();

      // Add priority fee if applicable
      if (priorityRate && priorityRate > 0) {
        const priorityFeeInstruction = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: priorityRate,
        });
        transaction.add(priorityFeeInstruction);
      }

      for (const account of chunk) {
        const tokenAccountPublicKey = new PublicKey(account);
        const instruction = new splToken.TransactionInstruction({
          keys: [
            { pubkey: tokenAccountPublicKey, isSigner: false, isWritable: true },
            { pubkey: mintAddressPublicKey, isSigner: false, isWritable: false },
            { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
          ],
          programId: splToken.TOKEN_2022_PROGRAM_ID,
          data: Buffer.from(new Uint8Array([10])), // Freeze instruction data
        });
        transaction.add(instruction);
      }

      // Set fee payer and get recent blockhash
      transaction.feePayer = keypair.publicKey;
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      // Sign and send transaction
      const signature = await connection.sendTransaction(transaction, [keypair]);
      await connection.confirmTransaction(signature, 'confirmed');
      transactionSignatures.push(signature);
    }

    res.status(200).json({ success: true, signatures: transactionSignatures });
  } catch (error: any) { // Explicitly define error as any
    console.error('Error in freeze-tokens API:', error);
    res.status(500).json({ error: error.message || 'Failed to freeze tokens' });
  }
}
