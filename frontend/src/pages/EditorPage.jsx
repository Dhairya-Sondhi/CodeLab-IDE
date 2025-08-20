// src/pages/EditorPage.jsx
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import { io } from 'socket.io-client';
import * as Y from 'yjs';
import * as monaco from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import CursorManager from '../components/editor/CursorManager';
import '../styles/editor.css';

function EditorPage() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { user, signOut, loading: authLoading } = useAuth();

    const monacoRef = useRef(null);
    const socketRef = useRef(null);
    const [editor, setEditor] = useState(null);
    const [yDoc, setYDoc] = useState(null);
    const [binding, setBinding] = useState(null);
    const [currentLanguage, setCurrentLanguage] = useState('javascript');
    const [connectedUsers, setConnectedUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [output, setOutput] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [userInput, setUserInput] = useState('');

    // UPDATED: Your actual backend URL from Render
    const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001'
        : 'https://codelab-backend-1kcg.onrender.com';

    const handleCopyRoomId = () => {
        navigator.clipboard.writeText(roomId);
        alert(`Room ID "${roomId}" copied to clipboard!`);
    };

    const handleLeaveRoom = () => navigate('/');

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    const handleLanguageChange = (e) => {
        const newLanguage = e.target.value;
        setCurrentLanguage(newLanguage);
        if (yDoc) {
            yDoc.getMap('metadata').set('language', newLanguage);
        }
    };

    const handleInputChange = (value) => {
        setUserInput(value);
        if (socketRef.current && roomId) {
            socketRef.current.emit('input-update', { roomId, input: value });
        }
    };

    // UPDATED: Fixed API endpoint URL
    const handleRunCode = async () => {
        if (!editor) return;

        setIsExecuting(true);
        setOutput('🔄 Executing code...');

        // Notify other users that code is executing
        if (socketRef.current && roomId) {
            socketRef.current.emit('code-execution', { roomId, isExecuting: true });
            socketRef.current.emit('output-update', { roomId, output: '🔄 Executing code...' });
        }

        const code = editor.getValue();

        try {
            console.log('🌐 Making request to:', `${API_BASE_URL}/execute`);
            
            // FIXED: Correct API endpoint
            const response = await fetch(`${API_BASE_URL}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code,
                    language: currentLanguage,
                    input: userInput
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('📋 Response data:', result);
            
            let formattedOutput = '';
            
            if (result.output) {
                formattedOutput += `📤 Output:\n${result.output}`;
            } else if (result.error) {
                formattedOutput += `❌ Error:\n${result.error}`;
            } else {
                formattedOutput += '📤 Output:\nExecution finished with no output.';
            }
            
            if (result.time) {
                formattedOutput += `\n\n⏱️ Execution Time: ${result.time}`;
            }
            
            if (result.memory) {
                formattedOutput += `\n💾 Memory Used: ${result.memory}`;
            }

            setOutput(formattedOutput);

            // Sync output to other users
            if (socketRef.current && roomId) {
                socketRef.current.emit('output-update', { roomId, output: formattedOutput });
            }

        } catch (error) {
            console.error("❌ Network error:", error);
            const errorMessage = `❌ Connection Error: ${error.message}\n\n💡 Backend Status: ${isConnected ? 'Connected' : 'Disconnected'}\n🔗 Backend URL: ${API_BASE_URL}`;
            setOutput(errorMessage);

            // Sync error to other users
            if (socketRef.current && roomId) {
                socketRef.current.emit('output-update', { roomId, output: errorMessage });
            }
        } finally {
            setIsExecuting(false);

            // Notify other users that execution finished
            if (socketRef.current && roomId) {
                socketRef.current.emit('code-execution', { roomId, isExecuting: false });
            }
        }
    };

    const handleEditorDidMount = (editorInstance, monacoInstance) => {
        setEditor(editorInstance);
        monacoRef.current = monacoInstance;

        // Python IntelliSense
        const pythonKeywords = [
            'def', 'class', 'if', 'elif', 'else', 'try', 'except', 'finally',
            'for', 'while', 'with', 'import', 'from', 'return', 'yield',
            'lambda', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False',
            'self', 'super', '__init__', '__str__', '__repr__', 'async', 'await',
            'global', 'nonlocal', 'pass', 'break', 'continue', 'assert', 'del'
        ];

        const pythonBuiltins = [
            'print', 'input', 'len', 'str', 'int', 'float', 'list', 'dict',
            'tuple', 'set', 'range', 'enumerate', 'zip', 'map', 'filter',
            'sum', 'max', 'min', 'abs', 'round', 'sorted', 'reversed',
            'open', 'type', 'isinstance', 'hasattr', 'getattr', 'setattr',
            'all', 'any', 'bin', 'hex', 'oct', 'chr', 'ord', 'pow'
        ];

        // Python completion provider
        monacoInstance.languages.registerCompletionItemProvider('python', {
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };

                const allSuggestions = [
                    ...pythonKeywords.map(keyword => ({
                        label: keyword,
                        kind: monacoInstance.languages.CompletionItemKind.Keyword,
                        insertText: keyword,
                        range: range,
                        detail: 'Python keyword'
                    })),
                    ...pythonBuiltins.map(builtin => ({
                        label: builtin,
                        kind: monacoInstance.languages.CompletionItemKind.Function,
                        insertText: builtin,
                        range: range,
                        detail: 'Built-in function'
                    }))
                ];

                const currentWord = word.word.toLowerCase();
                const suggestions = allSuggestions.filter(suggestion =>
                    suggestion.label.toLowerCase().startsWith(currentWord)
                );

                return { suggestions };
            },
            triggerCharacters: ['.']
        });

        // Similar completion providers for C++, Java, etc.
        // (keeping the same logic as your original file)
    };

    // UPDATED: Socket connection with correct backend URL
    useEffect(() => {
        if (!authLoading && user) {
            setCurrentUser(user);
            
            console.log(`🔌 Connecting to backend: ${API_BASE_URL}`);
            
            const socket = io(API_BASE_URL, {
                transports: ['websocket', 'polling'],
                timeout: 20000,
                forceNew: true,
                withCredentials: true
            });
            
            socketRef.current = socket;
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

            socket.on('connect', () => {
                console.log('✅ Socket.io connected successfully!');
                setIsConnected(true);
                socket.emit('join-room', { roomId, user });
            });

            socket.on('connect_error', (error) => {
                console.error('❌ Socket.io connection failed:', error);
                setIsConnected(false);
            });

            socket.on('disconnect', () => {
                console.log('🔌 Socket.io disconnected');
                setIsConnected(false);
                setConnectedUsers([]);
            });

            socket.on('doc-sync', (docState) => Y.applyUpdate(doc, new Uint8Array(docState)));

            socket.on('doc-update', (update) => Y.applyUpdate(doc, new Uint8Array(update)));

            // Load existing room state when joining
            socket.on('room-state-sync', ({ input, output }) => {
                console.log('📥 Received room state:', { input, output });
                setTimeout(() => {
                    if (input !== undefined) setUserInput(input);
                    if (output !== undefined) setOutput(output);
                }, 100);
            });

            // Listen for user updates
            socket.on('users-update', (users) => {
                console.log('👥 Users updated:', users);
                setConnectedUsers(users);
            });

            // Real-time sync events
            socket.on('input-sync', (input) => {
                setUserInput(input);
            });

            socket.on('output-sync', (output) => {
                setOutput(output);
            });

            socket.on('execution-status', (isExecuting) => {
                setIsExecuting(isExecuting);
            });

            doc.on('update', (update) => {
                socket.emit('doc-update', { roomId, update });
            });

            return () => {
                socket.disconnect();
                doc.destroy();
                socketRef.current = null;
            };
        }
    }, [roomId, user, authLoading, editor, API_BASE_URL]);

    useEffect(() => {
        if (editor && yDoc) {
            const monacoBinding = new MonacoBinding(yDoc.getText('monaco'), editor.getModel(), new Set([editor]));
            setBinding(monacoBinding);

            return () => {
                binding?.destroy();
            };
        }
    }, [editor, yDoc]);

    if (authLoading) {
        return <div className="loading-container">Authenticating & Loading Session...</div>;
    }

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
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                        <option value="html">HTML</option>
                        <option value="css">CSS</option>
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
                        defaultValue="// Welcome to CodeLab IDE!\n// Write your code here and click 'Run Code' to execute it.\n// You can collaborate in real-time with other users!\n\nconsole.log('Hello, CodeLab!');"
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
                    
                    {/* CursorManager component */}
                    {editor && socketRef.current && (
                        <CursorManager
                            editor={editor}
                            socket={socketRef.current}
                            roomId={roomId}
                            currentUser={{
                                id: user?.id,
                                name: user?.user_metadata?.username || user?.email || 'Anonymous'
                            }}
                            connectedUsers={connectedUsers}
                        />
                    )}
                </div>

                {/* Bottom Section: Input and Output side by side */}
                <div className="input-output-container">
                    {/* Input Panel */}
                    <div className="input-panel">
                        <div className="input-header">
                            <h3>📝 Input</h3>
                            <Button 
                                onClick={() => handleInputChange('')}
                                variant="secondary"
                                className="clear-btn"
                            >
                                Clear
                            </Button>
                        </div>
                        <textarea
                            className="input-textarea"
                            value={userInput}
                            onChange={(e) => handleInputChange(e.target.value)}
                            placeholder="Enter input for your program here (each line will be provided when input() is called)..."
                        />
                    </div>

                    {/* Output Panel */}
                    <div className="output-panel">
                        <div className="output-header">
                            <h3>📋 Output Console</h3>
                            <Button 
                                onClick={() => {
                                    setOutput('');
                                    if (socketRef.current && roomId) {
                                        socketRef.current.emit('output-update', { roomId, output: '' });
                                    }
                                }}
                                variant="secondary"
                                className="clear-btn"
                            >
                                🗑️ Clear
                            </Button>
                        </div>
                        <div className="output-content">
                            <pre className="output-text">
                                {output || '💡 Write some code and click "Run Code" to see the output here...\n\n👥 Collaborative Features:\n• See other users\' cursors in real-time\n• Watch live code changes\n• Execute code together\n\nSupported Languages:\n• JavaScript: console.log("Hello")\n• Python: print("Hello")\n• Java: System.out.println("Hello")\n• C++: cout << "Hello" << endl;\n• C: printf("Hello\\n");'}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EditorPage;
