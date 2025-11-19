import React from 'react';

interface SidebarProps {
  activeView: string;
  setActiveView: (view: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView }) => {
  const navItems = [
    { id: 'creation', label: 'Token Creation' },
    { id: 'configuration', label: 'Token Configuration' },
    { id: 'whitelist', label: 'Whitelist Management' },
    { id: 'freeze', label: 'Freeze Holders' },
  ];

  return (
    <aside className="w-64 bg-gray-800 text-white p-4 flex-shrink-0">
      <nav>
        <ul>
          {navItems.map(item => (
            <li key={item.id} className="mb-2">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveView(item.id);
                }}
                className={`block p-2 rounded ${
                  activeView === item.id ? 'bg-gray-700' : 'hover:bg-gray-700'
                }`}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
