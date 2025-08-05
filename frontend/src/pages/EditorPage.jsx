// src/pages/EditorPage.jsx
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';

function EditorPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  // Refs and State Hooks
  const monacoRef = useRef(null);
  const [editor, setEditor] = useState(null);
  const [yDoc, setYDoc] = useState(null);
  const [binding, setBinding] = useState(null);
  const [currentLanguage, setCurrentLanguage] = useState('javascript');

  // --- UI Handlers ---
  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert(`Room ID "${roomId}" copied to clipboard!`);
  };

  const handleLeaveRoom = () => {
    navigate('/');
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    if(yDoc) {
      // Set the language on the shared metadata map to sync with others
      yDoc.getMap('metadata').set('language', newLanguage);
    }
  };

  const handleEditorDidMount = (editorInstance, monacoInstance) => {
    setEditor(editorInstance);
    monacoRef.current = monacoInstance;
  };

  // --- Main Connection and Syncing Logic ---
  useEffect(() => {
    // IMPORTANT: Replace with your actual Render backend URL
    const socket = io("https://codelab-backend-q5m7.onrender.com");
    const doc = new Y.Doc();
    setYDoc(doc);

    const yMetadata = doc.getMap('metadata');

    yMetadata.observe(event => {
      const newLang = yMetadata.get('language');
      if (newLang && monacoRef.current && editor) {
        setCurrentLanguage(newLang);
        monacoRef.current.editor.setModelLanguage(editor.getModel(), newLang);
      }
    });

    socket.on('connect', () => {
        console.log('Handshake complete! Connected to backend.');
        socket.emit('join-room', roomId);
    });

    socket.on('doc-sync', (docState) => {
      Y.applyUpdate(doc, new Uint8Array(docState));
    });

    socket.on('doc-update', (update) => {
      Y.applyUpdate(doc, new Uint8Array(update));
    });

    doc.on('update', (update) => {
      socket.emit('doc-update', { roomId, update });
    });

    return () => {
      socket.disconnect();
      doc.destroy();
    };
  }, [roomId]);

  // Effect to create the Monaco Binding once editor and yDoc are ready
  useEffect(() => {
    if (editor && yDoc) {
      const monacoBinding = new MonacoBinding(
        yDoc.getText('monaco'),
        editor.getModel(),
        new Set([editor])
      );
      setBinding(monacoBinding);
    }
    return () => {
      binding?.destroy();
    };
  }, [editor, yDoc]);

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ marginBottom: '10px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <h1>Codelab Editor</h1>
          <p>Room ID: <strong>{roomId}</strong></p>
          <button onClick={handleCopyRoomId}>Copy Room ID</button>

          <div>
            <label htmlFor="language-select">Language: </label>
            <select id="language-select" value={currentLanguage} onChange={handleLanguageChange}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="java">Java</option>
              <option value="markdown">Markdown</option>
            </select>
          </div>

          <button onClick={handleLeaveRoom}>Leave Room</button>
      </div>
      <Editor
        height="80vh"
        theme="vs-dark"
        language={currentLanguage}
        defaultValue="// Loading collaborative session..."
        onMount={handleEditorDidMount}
      />
    </div>
  );
}

export default EditorPage;