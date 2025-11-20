import { NextApiRequest, NextApiResponse } from 'next';
import {
  Keypair,
  PublicKey,
  Transaction,
  Connection,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import * as splToken from '@solana/spl-token';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tokenAccounts, mintAddress, priorityRate } = req.body;

  if (!tokenAccounts || !Array.isArray(tokenAccounts) || !mintAddress) {
    return res.status(400).json({ error: 'Missing required parameters: tokenAccounts and mintAddress' });
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

  const keypair = Keypair.fromSecretKey(secret);
  const connection = new Connection(process.env.NEXT_NETWORK!, 'confirmed'); // Assuming NEXT_NETWORK is set in .env

  try {
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
  } catch (error: any) {
    console.error('Error freezing tokens:', error);
    res.status(500).json({ error: error.message || 'Failed to freeze tokens' });
  }
}
