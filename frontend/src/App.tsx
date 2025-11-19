import React, { useState, useEffect, useRef, useMemo } from 'react';
import './App.css';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import WalletConnection from './components/WalletConnection';
import TokenCreation from './components/TokenCreation';
import TokenConfiguration from './components/TokenConfiguration';
import WhitelistManagement from './components/WhitelistManagement';
import FreezeHolders from './components/FreezeHolders';
import MessageLog from './components/MessageLog';
import '@solana/wallet-adapter-react-ui/styles.css';


export interface AppConfig {
  privateKey: string;
  rpcEndpoint: string;
  mintAddress: string;
  freezeThreshold: number;
  freezeDelay: number;
  timeout: number;
  priorityRate: number;
  whitelist: string[];
}

export interface MessageType {
  text: string;
  type: string;
  id: number;
}

function App() {
  const network = clusterApiUrl('devnet');
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  const [config, setConfig] = useState<AppConfig>({
    privateKey: "2kUN9hN3g9wPVS31Jn9Ab7jcudDh7CuGVukCLoSYhZeZGAu3QEBkJPaHY7wv18wibGUAurJ5q33MBC685Xx96PBd",
    rpcEndpoint: "https://devnet.helius-rpc.com/?api-key=2672dff0-a5c3-46c6-9426-863d32acd620",
    mintAddress: "4ymjEVRokyipGDxwgkNez3cvMqwnkL5n3jM7zThsmC41",
    freezeThreshold: 0,
    freezeDelay: 0,
    timeout: 180,
    priorityRate: 25000,
    whitelist: []
  });

  const [messages, setMessages] = useState<MessageType[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('solanaTokenManagerConfig');
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig));
    }
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const displayMessage = (message: string, type: string = 'info') => {
    setMessages(prev => [{ text: message, type, id: Date.now() }, ...prev.slice(0, 9)]);
  };

  const saveConfig = () => {
    localStorage.setItem('solanaTokenManagerConfig', JSON.stringify(config));
    displayMessage('Configuration saved to local storage.', 'success');
  };

  const updateConfig = (updates: Partial<AppConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  return (
    <ConnectionProvider endpoint={config.rpcEndpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="App">
            <div className="container">
              <h1>🍯 Solana Token Manager</h1>

              <WalletConnection
                displayMessage={displayMessage}
              />

              <TokenCreation 
                config={config}
                updateConfig={updateConfig}
                displayMessage={displayMessage}
              />


              <TokenConfiguration 
                config={config}
                updateConfig={updateConfig}
                saveConfig={saveConfig}
                displayMessage={displayMessage}
              />

              <WhitelistManagement 
                whitelist={config.whitelist}
                updateWhitelist={(newWhitelist) => updateConfig({ whitelist: newWhitelist })}
                saveConfig={saveConfig}
                displayMessage={displayMessage}
              />

              <FreezeHolders 
                config={config}
                displayMessage={displayMessage}
              />

              <MessageLog messages={messages} messagesEndRef={messagesEndRef} />
            </div>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
