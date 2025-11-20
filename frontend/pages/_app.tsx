import Head from 'next/head';
import '@solana/wallet-adapter-react-ui/styles.css';
import type { AppProps } from 'next/app';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { useMemo } from 'react';
import { clusterApiUrl } from '@solana/web3.js';
import { AppConfig } from "./index";

function MyApp({ Component, pageProps }: AppProps) {
  const rpcEndpoint = useMemo(() => {
    const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_ENDPOINT;
    if (!endpoint) {
      console.warn("NEXT_PUBLIC_SOLANA_RPC_ENDPOINT is not set. Falling back to devnet.");
      return clusterApiUrl('devnet');
    }
    return endpoint;
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={rpcEndpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Head>
            <link href="https://unpkg.com/tailwindcss@^2/dist/tailwind.min.css" rel="stylesheet" />
          </Head>
          <Component {...pageProps} />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default MyApp;
