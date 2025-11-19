import React, { useState, useEffect } from 'react';
import { AppConfig } from '../App';

interface TokenConfigurationProps {
  config: AppConfig;
  updateConfig: (updates: Partial<AppConfig>) => void;
  displayMessage: (message: string, type?: string) => void;
}

const TokenConfiguration: React.FC<TokenConfigurationProps> = ({ config, updateConfig, displayMessage }) => {
  const [mintAddress, setMintAddress] = useState<string>("");
  const [freezeThreshold, setFreezeThreshold] = useState<string>("0");
  const [freezeDelay, setFreezeDelay] = useState<string>("0");
  const [priorityRate, setPriorityRate] = useState<string>("25000");

  useEffect(() => {
    setMintAddress(config.mintAddress);
    setFreezeThreshold(String(config.freezeThreshold));
    setFreezeDelay(String(config.freezeDelay));
    setPriorityRate(String(config.priorityRate));
  }, [config.mintAddress, config.freezeThreshold, config.freezeDelay, config.priorityRate]);

  const handleSaveConfig = () => {
    updateConfig({
      mintAddress: mintAddress,
      freezeThreshold: parseInt(freezeThreshold) || 0,
      freezeDelay: parseInt(freezeDelay) || 0,
      priorityRate: parseInt(priorityRate) || 0,
    });
    displayMessage('Configuration updated and saved.', 'success');
  };

  return (
    <section className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Token Configuration</h2>
      <div className="flex flex-col gap-4 max-w-md">
        <label htmlFor="config-mint-address" className="font-semibold">Mint Address:</label>
        <input
          type="text"
          id="config-mint-address"
          value={mintAddress}
          onChange={(e) => setMintAddress(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="config-freeze-threshold" className="font-semibold">Freeze Threshold:</label>
        <input
          type="number"
          id="config-freeze-threshold"
          value={freezeThreshold}
          onChange={(e) => setFreezeThreshold(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="config-freeze-delay" className="font-semibold">Freeze Delay (seconds):</label>
        <input
          type="number"
          id="config-freeze-delay"
          value={freezeDelay}
          onChange={(e) => setFreezeDelay(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="config-priority-rate" className="font-semibold">Priority Rate (micro-lamports):</label>
        <input
          type="number"
          id="config-priority-rate"
          value={priorityRate}
          onChange={(e) => setPriorityRate(e.target.value)}
          className="bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button 
          onClick={handleSaveConfig}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded transition duration-300"
        >
          Save Configuration
        </button>
      </div>
    </section>
  );
};

export default TokenConfiguration;
