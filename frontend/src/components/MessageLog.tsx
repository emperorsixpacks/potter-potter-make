import React from 'react';
import { MessageType } from '../App';
import '../styles/MessageLog.css';

interface MessageLogProps {
  messages: MessageType[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const MessageLog: React.FC<MessageLogProps> = ({ messages, messagesEndRef }) => {
  return (
    <div id="messages" className="message-log">
      {messages.map((msg, index) => (
        <p key={`${msg.id}-${index}`} className={msg.type}>
          {msg.text}
        </p>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageLog;
