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
    const [executionTime, setExecutionTime] = useState(null);
    const [executionMemory, setExecutionMemory] = useState(null);

    // API Base URL - Updated for production
    const API_BASE_URL = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001'
        : 'https://codelab-backend-q5m7.onrender.com';

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
        if (yDoc && socketRef.current) {
            yDoc.getMap('metadata').set('language', newLanguage);
            socketRef.current.emit('language-change', { roomId, language: newLanguage });
        }
    };

    // Handle input changes with sync
    const handleInputChange = (value) => {
        setUserInput(value);
        if (socketRef.current && roomId) {
            socketRef.current.emit('input-update', { roomId, input: value });
        }
    };

    // Updated handleRunCode with proper API endpoint
    const handleRunCode = async () => {
        if (!editor) {
            setOutput("❌ Editor not ready. Please wait and try again.");
            return;
        }
        
        setIsExecuting(true);
        setOutput('🔄 Executing code...');
        setExecutionTime(null);
        setExecutionMemory(null);
        
        // Notify other users that code is executing
        if (socketRef.current && roomId) {
            socketRef.current.emit('code-execution', { roomId, isExecuting: true });
            socketRef.current.emit('output-update', { roomId, output: '🔄 Executing code...' });
        }

        const code = editor.getValue();
        
        if (!code.trim()) {
            setOutput("❌ No code to execute. Please write some code first.");
            setIsExecuting(false);
            return;
        }

        try {
            console.log('🌐 Making request to:', `${API_BASE_URL}/api/execute`);
            
            const response = await fetch(`${API_BASE_URL}/api/execute`, {
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

            const result = await response.json();
            console.log('📋 Response data:', result);
            
            if (response.ok) {
                // Format the output with execution details
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
                
                // Sync output to other users
                if (socketRef.current && roomId) {
                    socketRef.current.emit('output-update', { roomId, output: formattedOutput });
                }
            } else {
                const errorMessage = `❌ Error: ${result.error || 'Unknown error occurred'}`;
                setOutput(errorMessage);
                
                // Sync error to other users
                if (socketRef.current && roomId) {
                    socketRef.current.emit('output-update', { roomId, output: errorMessage });
                }
            }
        } catch (error) {
            console.error("❌ Network error:", error);
            const errorMessage = `❌ Connection Error: ${error.message}\n\n💡 Make sure your backend server is running`;
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

    const handleClearOutput = () => {
        setOutput('');
        setExecutionTime(null);
        setExecutionMemory(null);
        if (socketRef.current && roomId) {
            socketRef.current.emit('output-update', { roomId, output: '' });
        }
    };

    const handleEditorDidMount = (editorInstance, monacoInstance) => {
        setEditor(editorInstance);
        monacoRef.current = monacoInstance;

        // Enhanced IntelliSense for Python
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

        const pythonMethods = {
            'str': ['upper', 'lower', 'strip', 'split', 'join', 'replace', 'find', 'startswith', 'endswith', 'isdigit', 'isalpha', 'isalnum', 'count', 'index'],
            'list': ['append', 'extend', 'insert', 'remove', 'pop', 'index', 'count', 'sort', 'reverse', 'clear', 'copy'],
            'dict': ['get', 'keys', 'values', 'items', 'pop', 'popitem', 'clear', 'update', 'copy', 'setdefault']
        };

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

                const line = model.getLineContent(position.lineNumber);
                const textUntilPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                let suggestions = [];

                // Check for method calls
                const methodMatch = textUntilPosition.match(/(\w+)\.$/);
                if (methodMatch) {
                    const varName = methodMatch[1];
                    let methods = [];

                    if (line.includes(`${varName} = "`) || line.includes(`${varName} = '`) || textUntilPosition.includes('str(')) {
                        methods = pythonMethods.str;
                    } else if (line.includes(`${varName} = [`) || textUntilPosition.includes('list(')) {
                        methods = pythonMethods.list;
                    } else if (line.includes(`${varName} = {`) || textUntilPosition.includes('dict(')) {
                        methods = pythonMethods.dict;
                    } else {
                        methods = [...pythonMethods.str, ...pythonMethods.list, ...pythonMethods.dict];
                    }

                    suggestions = methods.map(method => ({
                        label: method,
                        kind: monacoInstance.languages.CompletionItemKind.Method,
                        insertText: method,
                        range: range,
                        detail: `${method}() method`
                    }));
                } else {
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
                    suggestions = allSuggestions.filter(suggestion =>
                        suggestion.label.toLowerCase().startsWith(currentWord)
                    );
                }

                return { suggestions };
            },
            triggerCharacters: ['.']
        });

        // Enhanced C++ IntelliSense
        const cppKeywords = [
            'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
            'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
            'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static',
            'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
            'class', 'private', 'protected', 'public', 'friend', 'inline', 'template',
            'virtual', 'bool', 'true', 'false', 'namespace', 'using', 'try', 'catch',
            'throw', 'new', 'delete', 'this', 'operator', 'const_cast', 'dynamic_cast',
            'reinterpret_cast', 'static_cast', 'nullptr', 'constexpr', 'decltype',
            'override', 'final', 'noexcept', 'thread_local', 'alignas', 'alignof'
        ];

        const cppStdLibrary = [
            'cout', 'cin', 'endl', 'string', 'vector', 'map', 'set', 'list',
            'queue', 'stack', 'priority_queue', 'pair', 'make_pair',
            'sort', 'find', 'max', 'min', 'swap', 'reverse', 'unique'
        ];

        // C++ completion provider
        monacoInstance.languages.registerCompletionItemProvider('cpp', {
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };

                const textUntilPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                let suggestions = [];

                if (textUntilPosition.endsWith('std::')) {
                    suggestions = cppStdLibrary.map(func => ({
                        label: func,
                        kind: monacoInstance.languages.CompletionItemKind.Function,
                        insertText: func,
                        range: range,
                        detail: 'Standard library function'
                    }));
                } else {
                    const allSuggestions = [
                        ...cppKeywords.map(keyword => ({
                            label: keyword,
                            kind: monacoInstance.languages.CompletionItemKind.Keyword,
                            insertText: keyword,
                            range: range,
                            detail: 'C++ keyword'
                        })),
                        ...cppStdLibrary.map(func => ({
                            label: `std::${func}`,
                            kind: monacoInstance.languages.CompletionItemKind.Function,
                            insertText: `std::${func}`,
                            range: range,
                            detail: 'Standard library function'
                        }))
                    ];

                    const currentWord = word.word.toLowerCase();
                    suggestions = allSuggestions.filter(suggestion =>
                        suggestion.label.toLowerCase().includes(currentWord)
                    );
                }

                return { suggestions };
            },
            triggerCharacters: ['.', '::', '#']
        });

        // Java IntelliSense
        const javaKeywords = [
            'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
            'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
            'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
            'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
            'package', 'private', 'protected', 'public', 'return', 'short', 'static',
            'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
            'transient', 'try', 'void', 'volatile', 'while'
        ];

        const javaBuiltins = [
            'System', 'String', 'Integer', 'Double', 'Float', 'Boolean', 'Character',
            'Object', 'Exception', 'RuntimeException', 'ArrayList', 'HashMap',
            'HashSet', 'LinkedList', 'StringBuilder', 'StringBuffer'
        ];

        // Java completion provider
        monacoInstance.languages.registerCompletionItemProvider('java', {
            provideCompletionItems: (model, position) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };

                const textUntilPosition = model.getValueInRange({
                    startLineNumber: position.lineNumber,
                    startColumn: 1,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column
                });

                let suggestions = [];

                if (textUntilPosition.endsWith('System.out.')) {
                    suggestions = ['println', 'print', 'printf'].map(method => ({
                        label: method,
                        kind: monacoInstance.languages.CompletionItemKind.Method,
                        insertText: method,
                        range: range,
                        detail: `System.out.${method}() method`
                    }));
                } else {
                    const allSuggestions = [
                        ...javaKeywords.map(keyword => ({
                            label: keyword,
                            kind: monacoInstance.languages.CompletionItemKind.Keyword,
                            insertText: keyword,
                            range: range,
                            detail: 'Java keyword'
                        })),
                        ...javaBuiltins.map(builtin => ({
                            label: builtin,
                            kind: monacoInstance.languages.CompletionItemKind.Class,
                            insertText: builtin,
                            range: range,
                            detail: 'Java class'
                        }))
                    ];

                    const currentWord = word.word.toLowerCase();
                    suggestions = allSuggestions.filter(suggestion =>
                        suggestion.label.toLowerCase().startsWith(currentWord)
                    );
                }

                return { suggestions };
            },
            triggerCharacters: ['.']
        });
    };

    // Main connection and syncing logic
    useEffect(() => {
        if (!authLoading && user) {
            setCurrentUser(user);
            
            console.log('🔌 Attempting to connect to:', API_BASE_URL);
            
            const socket = io(API_BASE_URL, {
                transports: ['polling', 'websocket'], // Add transport fallback
                timeout: 20000,
                forceNew: true
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

            socket.on('language-changed', (language) => {
                setCurrentLanguage(language);
                if (monacoRef.current && editor) {
                    monacoRef.current.editor.setModelLanguage(editor.getModel(), language);
                }
            });

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

            socket.on('user-joined', (userData) => {
                setConnectedUsers(prev => {
                    const filtered = prev.filter(u => u.id !== userData.id);
                    return [...filtered, userData];
                });
            });

            socket.on('user-left', (userId) => {
                setConnectedUsers(prev => prev.filter(u => u.id !== userId));
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
                monacoBinding.destroy();
            };
        }
    }, [editor, yDoc]);

    if (authLoading) {
        return <div className="loading-container">Authenticating & Loading Session...</div>;
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
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                        <option value="c">C</option>
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
                    
                    {/* Add CursorManager component */}
                    {editor && socketRef.current && isConnected && (
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
        </div>
    );
}

export default EditorPage;
