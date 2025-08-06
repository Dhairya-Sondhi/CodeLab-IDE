// src/pages/EditorPage.jsx
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import CursorManager from '../components/editor/CursorManager'; // NEW IMPORT
import '../styles/editor.css';

function EditorPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // Refs and State Hooks
  const monacoRef = useRef(null);
  const [editor, setEditor] = useState(null);
  const [socket, setSocket] = useState(null); // NEW STATE
  const [yDoc, setYDoc] = useState(null);
  const [binding, setBinding] = useState(null);
  const [currentLanguage, setCurrentLanguage] = useState('javascript');
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionTime, setExecutionTime] = useState(null);
  const [executionMemory, setExecutionMemory] = useState(null);

  // API Base URL - switches between local development and production
  const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001'
    : 'https://codelab-backend-q5m7.onrender.com';

  // --- UI Handlers ---
  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    alert(`Room ID "${roomId}" copied to clipboard!`);
  };

  const handleLeaveRoom = () => {
    navigate('/');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setCurrentLanguage(newLanguage);
    if (socket && yDoc) {
      yDoc.getMap('metadata').set('language', newLanguage);
      // Emit language change to other users
      socket.emit('language-change', { roomId, language: newLanguage });
    }
  };

  // Code Execution Handler
  const handleRunCode = async () => {
    if (!editor) {
      setOutput("❌ Editor not ready. Please wait and try again.");
      return;
    }
    
    setIsExecuting(true);
    setOutput("🔄 Executing code...");
    setExecutionTime(null);
    setExecutionMemory(null);
    
    const code = editor.getValue();
    
    if (!code.trim()) {
      setOutput("❌ No code to execute. Please write some code first.");
      setIsExecuting(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: code,
          language: currentLanguage
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        let formattedOutput = '';
        
        if (result.output) {
          formattedOutput += `📤 Output:\n${result.output}`;
        } else {
          formattedOutput += '📤 Output:\n(No output)';
        }
        
        if (result.status) {
          formattedOutput += `\n\n📊 Status: ${result.status}`;
        }
        
        if (result.time) {
          formattedOutput += `\n⏱️ Execution Time: ${result.time}s`;
          setExecutionTime(result.time);
        }
        
        if (result.memory) {
          formattedOutput += `\n💾 Memory Used: ${result.memory} KB`;
          setExecutionMemory(result.memory);
        }
        
        setOutput(formattedOutput);
      } else {
        setOutput(`❌ Error: ${result.error || 'Unknown error occurred'}`);
      }
    } catch (error) {
      console.error("Network error:", error);
      setOutput(`❌ Connection Error: ${error.message}\n\n💡 Make sure your backend server is running on port 3001`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClearOutput = () => {
    setOutput('');
    setExecutionTime(null);
    setExecutionMemory(null);
  };

  const handleEditorDidMount = (editorInstance, monacoInstance) => {
    setEditor(editorInstance);
    monacoRef.current = monacoInstance;
  };

  // --- Main Connection and Syncing Logic ---
  useEffect(() => {
    const SOCKET_URL = API_BASE_URL;
    const socketInstance = io(SOCKET_URL);
    setSocket(socketInstance); // Store socket in state
    const doc = new Y.Doc();
    setYDoc(doc);

    const yMetadata = doc.getMap('metadata');
    yMetadata.observe(event => {
      const newLang = yMetadata.get('language');
      if (newLang && monacoRef.current && editor && newLang !== currentLanguage) {
        setCurrentLanguage(newLang);
        monacoRef.current.editor.setModelLanguage(editor.getModel(), newLang);
      }
    });

    socketInstance.on('connect', () => {
      console.log('Connected to backend server');
      setIsConnected(true);
      socketInstance.emit('join-room', { 
        roomId, 
        user: {
          id: user?.id,
          name: user?.user_metadata?.username || user?.email || 'Anonymous'
        }
      });
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    socketInstance.on('user-joined', (userData) => {
      setConnectedUsers(prev => {
        const filtered = prev.filter(u => u.id !== userData.id);
        return [...filtered, userData];
      });
    });

    socketInstance.on('user-left', (userId) => {
      setConnectedUsers(prev => prev.filter(u => u.id !== userId));
    });

    socketInstance.on('room-users', (users) => {
      setConnectedUsers(users);
    });

    socketInstance.on('doc-sync', (docState) => {
      Y.applyUpdate(doc, new Uint8Array(docState));
    });

    socketInstance.on('doc-update', (update) => {
      Y.applyUpdate(doc, new Uint8Array(update));
    });

    socketInstance.on('language-changed', (language) => {
      setCurrentLanguage(language);
      if (monacoRef.current && editor) {
        monacoRef.current.editor.setModelLanguage(editor.getModel(), language);
      }
    });

    doc.on('update', (update) => {
      socketInstance.emit('doc-update', { roomId, update });
    });

    return () => {
      socketInstance.disconnect();
      doc.destroy();
      setSocket(null);
    };
  }, [roomId, user, API_BASE_URL]);

  // Effect to create the Monaco Binding once editor and yDoc are ready
  useEffect(() => {
    if (editor && yDoc) {
      const monacoBinding = new MonacoBinding(
        yDoc.getText('monaco'),
        editor.getModel(),
        new Set([editor])
      );
      setBinding(monacoBinding);

      return () => {
        monacoBinding.destroy();
      };
    }
  }, [editor, yDoc]);

  return (
    <div className="editor-container">
      {/* Header */}
      <header className="editor-header">
        <div className="header-left">
          <h1 className="editor-title">CodeLab IDE</h1>
          <div className="connection-status">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></div>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        
        <div className="header-center">
          <div className="room-info">
            <span className="room-label">Room:</span>
            <code className="room-id">{roomId}</code>
            <Button onClick={handleCopyRoomId} variant="secondary" className="copy-btn">
              Copy ID
            </Button>
          </div>
        </div>

        <div className="header-right">
          <div className="connected-users">
            <span className="users-count">{connectedUsers.length} users online</span>
            {/* Show user avatars/names */}
            <div className="users-list">
              {connectedUsers.slice(0, 3).map((connectedUser, index) => (
                <div 
                  key={connectedUser.id} 
                  className="user-avatar"
                  title={connectedUser.name}
                  style={{
                    backgroundColor: getUserAvatarColor(connectedUser.id),
                    marginLeft: index > 0 ? '-8px' : '0'
                  }}
                >
                  {connectedUser.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              ))}
              {connectedUsers.length > 3 && (
                <div className="user-avatar more-users">
                  +{connectedUsers.length - 3}
                </div>
              )}
            </div>
          </div>
          <Button onClick={handleLeaveRoom} variant="secondary">
            Leave Room
          </Button>
          <Button onClick={handleSignOut} variant="secondary">
            Sign Out
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <select 
            value={currentLanguage} 
            onChange={handleLanguageChange}
            className="language-select"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
            <option value="c">C</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
          </select>
        </div>
        
        <div className="toolbar-right">
          <Button 
            onClick={handleRunCode}
            loading={isExecuting}
            className="run-btn"
            disabled={!isConnected}
          >
            {isExecuting ? 'Running...' : '▶️ Run Code'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="editor-main">
        {/* Code Editor Panel */}
        <div className="editor-panel">
          <Editor
            height="100%"
            language={currentLanguage}
            theme="vs-dark"
            onMount={handleEditorDidMount}
            defaultValue="// Welcome to CodeLab IDE!\n// Write your code here and click 'Run Code' to execute it.\n// You can see other users' cursors in real-time!\n\nconsole.log('Hello, CodeLab!');"
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: 'on',
              lineNumbers: 'on',
              folding: true,
              contextmenu: true,
            }}
          />
          
          {/* Add the CursorManager component */}
          {editor && socket && isConnected && (
            <CursorManager
              editor={editor}
              socket={socket}
              roomId={roomId}
              currentUser={{
                id: user?.id,
                name: user?.user_metadata?.username || user?.email || 'Anonymous'
              }}
              connectedUsers={connectedUsers}
            />
          )}
        </div>

        {/* Output Panel */}
        <div className="output-panel">
          <div className="output-header">
            <h3>📋 Output Console</h3>
            <div className="output-controls">
              {executionTime && (
                <span className="execution-stats">
                  ⏱️ {executionTime}s
                </span>
              )}
              {executionMemory && (
                <span className="execution-stats">
                  💾 {executionMemory}KB
                </span>
              )}
              <Button 
                onClick={handleClearOutput} 
                variant="secondary" 
                className="clear-btn"
              >
                🗑️ Clear
              </Button>
            </div>
          </div>
          <div className="output-content">
            <pre className="output-text">
              {output || '💡 Write some code and click "Run Code" to see the output here...\n\n👥 Collaborative Features:\n• See other users\' cursors in real-time\n• Watch live code changes\n• Execute code together\n\nSupported Languages:\n• JavaScript: console.log("Hello")\n• Python: print("Hello")\n• Java: System.out.println("Hello")\n• C++: cout << "Hello" << endl;\n• C: printf("Hello\\n");'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function for user avatar colors
const getUserAvatarColor = (userId) => {
  const colors = [
    '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b',
    '#eb4d4b', '#6ab04c', '#7bed9f', '#70a1ff', '#5f27cd'
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

export default EditorPage;
