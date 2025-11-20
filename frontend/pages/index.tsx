import React, { useState, useEffect, useRef, useCallback } from 'react';
import WalletConnection from '../src/components/WalletConnection';
import TokenCreation from '../src/components/TokenCreation';
import TokenConfiguration from '../src/components/TokenConfiguration';
import WhitelistManagement from '../src/components/WhitelistManagement';
import FreezeHolders from '../src/components/FreezeHolders';
import MessageLog from '../src/components/MessageLog';
import Sidebar from '../src/components/Sidebar';
import Login from '../src/components/Login';


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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [config, setConfig] = useState<AppConfig>({
    privateKey: "2kUN9hN3g9wPVS31Jn9Ab7jcudDh7CuGVukCLoSYhZeZGAu3QEBkJPaHY7wv18wibGUAurJ5q33MBC685Xx96PBd",
    rpcEndpoint: `https://devnet.helius-rpc.com/?api-key={process.env.NEXT_PUBLIC_HELIUS_API_KEY!}`,
    mintAddress: "",
    freezeThreshold: 0,
    freezeDelay: 0,
    timeout: 180,
    priorityRate: 25000,
    whitelist: []
  });

  const [messages, setMessages] = useState<MessageType[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [activeView, setActiveView] = useState('creation');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    localStorage.setItem('solanaTokenManagerConfig', JSON.stringify(newConfig));
  };

  const updateWhitelistCallback = useCallback((newWhitelist: string[]) => {
    updateConfig({ whitelist: newWhitelist });
  }, [config]);

  const handleSetActiveView = (view: string) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  const handleLogin = (username: string, password: string) => {
    if (username === process.env.NEXT_PUBLIC_USERNAME && password === process.env.NEXT_PUBLIC_PASSWORD) {
      setIsAuthenticated(true);
      setLoginError(null);
    } else {
      setLoginError("Invalid username or password.");
    }
  };

  const renderContent = () => {
    switch (activeView) {
      case 'creation':
        return (
          <TokenCreation
            config={config}
            updateConfig={updateConfig}
            saveConfig={saveConfig}
            displayMessage={displayMessage}
          />
        );
      case 'configuration':
        return (
          <TokenConfiguration
            config={config}
            updateConfig={updateConfig}
            displayMessage={displayMessage}
          />
        );
      case 'whitelist':
        return (
          <WhitelistManagement
            whitelist={config.whitelist}
            updateWhitelist={updateWhitelistCallback}
            displayMessage={displayMessage}
          />
        );
      case 'freeze':
        return (
          <FreezeHolders
            config={config}
            displayMessage={displayMessage}
          />
        );
      default:
        return <p>Select a view from the sidebar.</p>;
    }
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} error={loginError} />;
  }

  return (
          <div className="relative min-h-screen md:flex bg-gray-900 text-white">
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black opacity-50 z-20 md:hidden"
                onClick={() => setSidebarOpen(false)}
              ></div>
            )}
            <div
              className={`bg-gray-900 text-white w-64 fixed inset-y-0 left-0 transform ${
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              } md:relative md:translate-x-0 transition-transform duration-200 ease-in-out z-30`}
            >
              <Sidebar activeView={activeView} setActiveView={handleSetActiveView} />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <header className="bg-gray-800 p-4 flex justify-between items-center shadow-md">
                <div className="flex items-center">
                  <button
                    className="md:hidden text-white mr-4"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 6h16M4 12h16m-7 6h7"
                      ></path>
                    </svg>
                  </button>
                  <h1 className="text-xl font-bold">🍯 Solana Token Manager</h1>
                </div>
                <WalletConnection />
              </header>
              <main className="flex-1 p-6 overflow-y-auto">
                {renderContent()}
              </main>
              <MessageLog messages={messages} messagesEndRef={messagesEndRef} />
            </div>
          </div>
  );
}

export default App;
