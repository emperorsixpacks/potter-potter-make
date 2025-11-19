import React, { useState } from 'react';
import { PublicKey } from '@solana/web3.js';

interface WhitelistManagementProps {
  whitelist: string[];
  updateWhitelist: (newWhitelist: string[]) => void;
  displayMessage: (message: string, type?: string) => void;
}

const WhitelistManagement: React.FC<WhitelistManagementProps> = ({ whitelist, updateWhitelist, displayMessage }) => {
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
    displayMessage(`Removed ${address} from whitelist.`, 'info');
  };

  return (
    <section className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Whitelist Management</h2>
      <div className="space-y-4">
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Address to add to whitelist"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className="flex-grow bg-gray-700 text-white border border-gray-600 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAddToWhitelist}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-300"
          >
            Add
          </button>
        </div>
        <div className="max-h-60 overflow-y-auto pr-2">
          <ul className="space-y-2">
            {whitelist.map((address) => (
              <li key={address} className="bg-gray-700 p-3 rounded-md flex justify-between items-center">
                <span className="font-mono text-sm break-all">{address}</span>
                <button
                  onClick={() => handleRemoveFromWhitelist(address)}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded transition duration-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default WhitelistManagement;
