import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface WalletConnectionProps {
  displayMessage: (message: string, type?: string) => void;
}

const WalletConnection: React.FC<WalletConnectionProps> = ({ displayMessage }) => {
  const { publicKey, connected, wallet } = useWallet();

  return (
    <section id="wallet-connection">
      <h2>Wallet Connection</h2>
      <WalletMultiButton />
      <p>Connected: <span id="connected-address">
        {publicKey ? publicKey.toBase58() : 'None'}
      </span></p>
      {connected && wallet && (
        <p>Wallet: <span>{wallet.adapter.name}</span></p>
      )}
    </section>
  );
};

export default WalletConnection;
