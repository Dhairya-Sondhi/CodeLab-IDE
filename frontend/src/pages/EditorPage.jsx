// src/pages/EditorPage.jsx
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react'; // 1. Import the Editor
import { useEffect } from 'react';
import { io } from 'socket.io-client';

function EditorPage() {
  const { roomId } = useParams();
    // --- ADD THIS ENTIRE useEffect BLOCK ---
  useEffect(() => {
    // Connect to your live Render backend
    // IMPORTANT: Replace the URL with your actual Render backend URL
    const socket = io("https://codelab-backend-q5m7.onrender.com"); 

    socket.on('connect', () => {
      console.log('Successfully connected to backend!');
    });

    // Clean up the connection when the component unmounts
    return () => {
      socket.disconnect();
    };
    }, []);   
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '10px' }}>
      <div style={{ marginBottom: '10px' }}>
        <h1>Editor</h1>
        <p>You are in Room: {roomId}</p>
      </div>

      {/* 2. Replace the placeholder div with the real Editor component */}
      <div style={{ flex: 1, border: '1px solid #ccc' }}>
        <Editor
          height="100%" // Make the editor fill its container
          theme="vs-dark"
          defaultLanguage="javascript"
          defaultValue="// Your code will appear here..."
        />
      </div>
    </div>
  );
}

export default EditorPage;