import React, { useState, useEffect } from 'react';
import { AppConfig } from '../App';

interface TokenConfigurationProps {
  config: AppConfig;
  updateConfig: (updates: Partial<AppConfig>) => void;
  saveConfig: () => void;
  displayMessage: (message: string, type?: string) => void;
}

const TokenConfiguration: React.FC<TokenConfigurationProps> = ({ config, updateConfig, saveConfig, displayMessage }) => {
  const [freezeThreshold, setFreezeThreshold] = useState<string>(config.freezeThreshold.toString());
  const [freezeDelay, setFreezeDelay] = useState<string>(config.freezeDelay.toString());
  const [priorityRate, setPriorityRate] = useState<string>(config.priorityRate.toString());

  useEffect(() => {
    setFreezeThreshold(config.freezeThreshold.toString());
    setFreezeDelay(config.freezeDelay.toString());
    setPriorityRate(config.priorityRate.toString());
  }, [config]);

  const handleSaveConfig = () => {
    const updatedConfig = {
      ...config,
      freezeThreshold: parseInt(freezeThreshold),
      freezeDelay: parseInt(freezeDelay),
      priorityRate: parseInt(priorityRate)
    };
    updateConfig(updatedConfig);
    localStorage.setItem('solanaTokenManagerConfig', JSON.stringify(updatedConfig));
    displayMessage('Configuration updated and saved.', 'success');
  };

  return (
    <section id="current-token-config">
      <h2>Current Token Configuration</h2>
      <label htmlFor="config-mint-address">Mint Address:</label>
      <input
        type="text"
        id="config-mint-address"
        value={config.mintAddress}
        readOnly
      />
      <label htmlFor="config-freeze-threshold">Freeze Threshold:</label>
      <input
        type="number"
        id="config-freeze-threshold"
        value={freezeThreshold}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFreezeThreshold(e.target.value)}
      />
      <label htmlFor="config-freeze-delay">Freeze Delay (seconds):</label>
      <input
        type="number"
        id="config-freeze-delay"
        value={freezeDelay}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFreezeDelay(e.target.value)}
      />
      <label htmlFor="config-priority-rate">Priority Rate (micro-lamports):</label>
      <input
        type="number"
        id="config-priority-rate"
        value={priorityRate}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPriorityRate(e.target.value)}
      />
      <button onClick={handleSaveConfig}>Save Configuration</button>
    </section>
  );
};

export default TokenConfiguration;
