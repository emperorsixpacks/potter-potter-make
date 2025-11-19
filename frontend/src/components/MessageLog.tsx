import React from 'react';
import { MessageType } from '../App';

interface MessageLogProps {
  messages: MessageType[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const MessageLog: React.FC<MessageLogProps> = ({ messages, messagesEndRef }) => {
  const typeClasses: { [key: string]: string } = {
    success: 'bg-green-800 border-green-500',
    error: 'bg-red-800 border-red-500',
    info: 'bg-blue-800 border-blue-500',
    warning: 'bg-yellow-800 border-yellow-500',
  };

  return (
    <div className="h-48 bg-gray-900 p-4 overflow-y-auto border-t border-gray-700">
      <div className="space-y-2">
        {messages.map((msg) => (
          <p key={msg.id} className={`text-sm text-white p-2 rounded-md border-l-4 ${typeClasses[msg.type] || 'bg-gray-700 border-gray-500'}`}>
            <span className="font-mono">{msg.text}</span>
          </p>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageLog;
