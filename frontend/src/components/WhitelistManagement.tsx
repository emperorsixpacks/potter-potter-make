import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';

interface WhitelistManagementProps {
  whitelist: string[];
  updateWhitelist: (newWhitelist: string[]) => void;
  saveConfig: () => void;
  displayMessage: (message: string, type?: string) => void;
}

const WhitelistManagement: React.FC<WhitelistManagementProps> = ({ whitelist, updateWhitelist, saveConfig, displayMessage }) => {
  const [newAddress, setNewAddress] = useState<string>('');

  const handleAddToWhitelist = () => {
    const address = newAddress.trim();
    if (!address) {
      displayMessage('Please enter an address to whitelist.', 'info');
      return;
    }

    try {
      new PublicKey(address); // Validate address
      if (!whitelist.includes(address)) {
        const updatedWhitelist = [...whitelist, address];
        updateWhitelist(updatedWhitelist);
        localStorage.setItem('solanaTokenManagerConfig', JSON.stringify({ whitelist: updatedWhitelist }));
        setNewAddress('');
        displayMessage(`Added ${address} to whitelist.`, 'success');
      } else {
        displayMessage('Address already in whitelist.', 'info');
      }
    } catch (error) {
      displayMessage('Invalid Solana address for whitelist.', 'error');
    }
  };

  const handleRemoveFromWhitelist = (address: string) => {
    const updatedWhitelist = whitelist.filter(item => item !== address);
    updateWhitelist(updatedWhitelist);
    localStorage.setItem('solanaTokenManagerConfig', JSON.stringify({ whitelist: updatedWhitelist }));
    displayMessage(`Removed ${address} from whitelist.`, 'info');
  };

  return (
    <section id="whitelist-management">
      <h2>Whitelist Management</h2>
      <ul id="whitelist-display">
        {whitelist.map((address) => (
          <li key={address}>
            <span>{address}</span>
            <button onClick={() => handleRemoveFromWhitelist(address)}>Remove</button>
          </li>
        ))}
      </ul>
      <input
        type="text"
        id="new-whitelist-address"
        placeholder="Address to add to whitelist"
        value={newAddress}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAddress(e.target.value)}
      />
      <button onClick={handleAddToWhitelist}>Add to Whitelist</button>
    </section>
  );
};

export default WhitelistManagement;
