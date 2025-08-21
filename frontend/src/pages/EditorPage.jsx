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
import FileTabs from '../components/editor/FileTabs';
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

    // Multi-file state
    const [files, setFiles] = useState({
        'main.js': {
            name: 'main.js',
            language: 'javascript',
            content: '// Welcome to CodeLab IDE!\n// Write your code here and click \'Run Code\' to execute it.\n// You can collaborate in real-time with other users!\n\nconsole.log(\'Hello, CodeLab!\');'
        }
    });
    const [activeFile, setActiveFile] = useState('main.js');

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
        
        // Update active file language
        setFiles(prev => ({
            ...prev,
            [activeFile]: {
                ...prev[activeFile],
                language: newLanguage
            }
        }));
        
        if (yDoc) {
            yDoc.getMap('metadata').set('language', newLanguage);
        }
    };

    // Handle input changes with sync
    const handleInputChange = (value) => {
        setUserInput(value);
        if (socketRef.current && roomId) {
            socketRef.current.emit('input-update', { roomId, input: value });
        }
    };

    // Utility functions for multi-file support
    const getLanguageFromExtension = (fileName) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const extensions = {
            js: 'javascript',
            jsx: 'javascript',
            ts: 'typescript',
            py: 'python',
            cpp: 'cpp',
            c: 'cpp',
            java: 'java',
            html: 'html',
            css: 'css',
            json: 'json',
            md: 'markdown',
            txt: 'plaintext'
        };
        return extensions[ext] || 'javascript';
    };

    const getDefaultContent = (language) => {
        const templates = {
            javascript: '// New JavaScript file\nconsole.log("Hello World!");',
            python: '# New Python file\nprint("Hello World!")',
            cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello World!" << endl;\n    return 0;\n}',
            java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World!");\n    }\n}',
            html: '<!DOCTYPE html>\n<html>\n<head>\n    <title>New HTML File</title>\n</head>\n<body>\n    <h1>Hello World!</h1>\n</body>\n</html>',
            css: '/* New CSS file */\nbody {\n    margin: 0;\n    padding: 20px;\n    font-family: Arial, sans-serif;\n}',
            json: '{\n  "name": "example",\n  "version": "1.0.0"\n}',
            markdown: '# New Markdown File\n\nHello World!'
        };
        return templates[language] || `// New ${language} file\nconsole.log("Hello World!");`;
    };

    // File management functions
    const handleFileSelect = (fileName) => {
        if (fileName === activeFile) return;
        setActiveFile(fileName);
        setCurrentLanguage(files[fileName].language);
        
        // Switch editor content to the selected file
        if (editor && files[fileName]) {
            editor.setValue(files[fileName].content || '');
            editor.focus();
        }
        
        if (socketRef.current && roomId) {
            socketRef.current.emit('file-changed', { roomId, fileName });
        }
    };

    const handleNewFile = () => {
        const fileName = prompt('Enter filename with extension:', `file${Date.now()}.js`);
        if (!fileName || files[fileName]) {
            if (files[fileName]) alert('File already exists!');
            return;
        }

        const language = getLanguageFromExtension(fileName);
        const content = getDefaultContent(language);

        setFiles(prev => ({
            ...prev,
            [fileName]: {
                name: fileName,
                language: language,
                content: content
            }
        }));

        // Switch to the new file
        setTimeout(() => {
            handleFileSelect(fileName);
        }, 100);

        if (socketRef.current && roomId) {
            socketRef.current.emit('file-created', { roomId, fileName, language, content });
        }
    };

    const handleBulkCreateFiles = (fileNames) => {
        const newFiles = { ...files };
        
        fileNames.forEach(fileName => {
            if (!newFiles[fileName]) {
                const language = getLanguageFromExtension(fileName);
                const content = getDefaultContent(language);
                
                newFiles[fileName] = {
                    name: fileName,
                    language: language,
                    content: content
                };
            }
        });
        
        setFiles(newFiles);
        
        // Switch to first new file
        if (fileNames.length > 0) {
            handleFileSelect(fileNames[0]);
        }
        
        // Sync with collaborators
        if (socketRef.current && roomId) {
            socketRef.current.emit('bulk-files-created', {
                roomId,
                files: fileNames.map(name => ({
                    fileName: name,
                    language: getLanguageFromExtension(name),
                    content: getDefaultContent(getLanguageFromExtension(name))
                }))
            });
        }
    };

    const handleFileClose = (fileName) => {
        if (Object.keys(files).length === 1) {
            alert('Cannot close the last file!');
            return;
        }

        const newFiles = { ...files };
        delete newFiles[fileName];
        setFiles(newFiles);

        // Switch to another file if we closed the active one
        if (fileName === activeFile) {
            const remainingFiles = Object.keys(newFiles);
            handleFileSelect(remainingFiles[0]);
        }

        if (socketRef.current && roomId) {
            socketRef.current.emit('file-closed', { roomId, fileName });
        }
    };

    // Handle run code with sync
    const handleRunCode = async () => {
        if (!editor) return;
        
        setIsExecuting(true);
        setOutput('Executing code...');
        
        // Notify other users that code is executing
        if (socketRef.current && roomId) {
            socketRef.current.emit('code-execution', { roomId, isExecuting: true });
            socketRef.current.emit('output-update', { roomId, output: 'Executing code...' });
        }
        
        const code = editor.getValue();
        
        // Update current file content
        setFiles(prev => ({
            ...prev,
            [activeFile]: {
                ...prev[activeFile],
                content: code
            }
        }));
        
        try {
          const response = await fetch('https://codelab-backend-1kcg.onrender.com/execute', {
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
          const outputResult = result.output || result.error || 'Execution finished with no output.';
          
          setOutput(outputResult);
          
          // Sync output to other users
          if (socketRef.current && roomId) {
            socketRef.current.emit('output-update', { roomId, output: outputResult });
          }

        } catch (error) {
          const errorMessage = `Network or server error: ${error.message}`;
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
    
    // Set initial content for active file
    if (files[activeFile] && files[activeFile].content) {
        editorInstance.setValue(files[activeFile].content);
    }
    
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
            } 
            else if (textUntilPosition.trim().startsWith('def ') && 
                     position.lineNumber > 1 && 
                     model.getLineContent(position.lineNumber - 1).includes('class ')) {
                suggestions.push({
                    label: '__init__',
                    kind: monacoInstance.languages.CompletionItemKind.Constructor,
                    insertText: '__init__(self):',
                    range: range,
                    detail: 'Constructor method'
                });
            }
            else {
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

    // C++ IntelliSense
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
        'sort', 'find', 'max', 'min', 'swap', 'reverse', 'unique',
        'lower_bound', 'upper_bound', 'binary_search', 'next_permutation',
        'prev_permutation', 'accumulate', 'count', 'count_if', 'find_if',
        'transform', 'copy', 'move', 'fill', 'generate', 'replace',
        'remove', 'remove_if', 'distance', 'advance', 'back_inserter'
    ];

    const cppHeaders = [
        '#include <iostream>', '#include <vector>', '#include <string>',
        '#include <algorithm>', '#include <map>', '#include <set>',
        '#include <queue>', '#include <stack>', '#include <cmath>',
        '#include <cstring>', '#include <cstdio>', '#include <cstdlib>',
        '#include <utility>', '#include <functional>', '#include <memory>',
        '#include <array>', '#include <deque>', '#include <list>',
        '#include <unordered_map>', '#include <unordered_set>',
        '#include <iterator>', '#include <numeric>', '#include <chrono>',
        '#include <thread>', '#include <mutex>', '#include <fstream>',
        '#include <sstream>', '#include <iomanip>'
    ];

    const cppContainerMethods = {
        'vector': ['push_back', 'pop_back', 'size', 'empty', 'clear', 'begin', 'end', 'front', 'back', 'at', 'resize', 'reserve', 'capacity', 'data', 'insert', 'erase', 'emplace_back'],
        'string': ['length', 'size', 'empty', 'clear', 'substr', 'find', 'replace', 'append', 'c_str', 'push_back', 'pop_back', 'insert', 'erase', 'compare', 'data'],
        'map': ['insert', 'erase', 'find', 'size', 'empty', 'clear', 'begin', 'end', 'count', 'at', 'operator[]', 'emplace', 'lower_bound', 'upper_bound'],
        'set': ['insert', 'erase', 'find', 'size', 'empty', 'clear', 'begin', 'end', 'count', 'emplace', 'lower_bound', 'upper_bound'],
        'queue': ['push', 'pop', 'front', 'back', 'size', 'empty'],
        'stack': ['push', 'pop', 'top', 'size', 'empty'],
        'list': ['push_back', 'pop_back', 'push_front', 'pop_front', 'size', 'empty', 'clear', 'begin', 'end', 'front', 'back', 'insert', 'erase']
    };

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

            const line = model.getLineContent(position.lineNumber);
            const textUntilPosition = model.getValueInRange({
                startLineNumber: position.lineNumber,
                startColumn: 1,
                endLineNumber: position.lineNumber,
                endColumn: position.column
            });

            let suggestions = [];

            if (textUntilPosition.includes('#include')) {
                suggestions = cppHeaders.map(header => ({
                    label: header,
                    kind: monacoInstance.languages.CompletionItemKind.Module,
                    insertText: header,
                    range: {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: 1,
                        endColumn: line.length + 1
                    },
                    detail: 'C++ Standard Header'
                }));
            }
            else if (textUntilPosition.endsWith('std::')) {
                suggestions = cppStdLibrary.map(func => ({
                    label: func,
                    kind: monacoInstance.languages.CompletionItemKind.Function,
                    insertText: func,
                    range: range,
                    detail: 'Standard library function'
                }));
            }
            else if (textUntilPosition.match(/(\w+)\.$/)) {
                const containerMatch = textUntilPosition.match(/(\w+)\.$/);
                if (containerMatch) {
                    const varName = containerMatch[1];
                    let methods = [];
                    
                    if (line.includes(`vector<`) || line.includes(`std::vector`) || line.includes(`${varName}.push_back`)) {
                        methods = cppContainerMethods.vector;
                    } else if (line.includes(`string`) || line.includes(`std::string`) || line.includes(`${varName} = "`)) {
                        methods = cppContainerMethods.string;
                    } else if (line.includes(`map<`) || line.includes(`std::map`)) {
                        methods = cppContainerMethods.map;
                    } else if (line.includes(`set<`) || line.includes(`std::set`)) {
                        methods = cppContainerMethods.set;
                    } else if (line.includes(`queue<`) || line.includes(`std::queue`)) {
                        methods = cppContainerMethods.queue;
                    } else if (line.includes(`stack<`) || line.includes(`std::stack`)) {
                        methods = cppContainerMethods.stack;
                    } else if (line.includes(`list<`) || line.includes(`std::list`)) {
                        methods = cppContainerMethods.list;
                    } else {
                        methods = [...cppContainerMethods.vector, ...cppContainerMethods.string];
                    }

                    suggestions = methods.map(method => ({
                        label: method,
                        kind: monacoInstance.languages.CompletionItemKind.Method,
                        insertText: method,
                        range: range,
                        detail: `${method}() method`
                    }));
                }
            }
            else {
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
            }
            else {
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

    useEffect(() => {
        if (!authLoading && user) {
            setCurrentUser(user);
            
            const socket = io("https://codelab-backend-1kcg.onrender.com");
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
                setIsConnected(true);
                socket.emit('join-room', { roomId, user });
            });

            socket.on('disconnect', () => {
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

            // Multi-file socket events
            socket.on('file-created', ({ fileName, language, content }) => {
                console.log(`New file created: ${fileName}`);
                setFiles(prev => ({
                    ...prev,
                    [fileName]: { name: fileName, language, content }
                }));
            });

            socket.on('bulk-files-created', ({ files }) => {
                console.log('Bulk files created by collaborator:', files);
                const newFiles = { ...files };
                files.forEach(({ fileName, language, content }) => {
                    if (!newFiles[fileName]) {
                        newFiles[fileName] = { name: fileName, language, content };
                    }
                });
                setFiles(prev => ({ ...prev, ...newFiles }));
            });

            socket.on('file-changed', ({ fileName }) => {
                console.log(`User switched to: ${fileName}`);
            });

            socket.on('file-closed', ({ fileName }) => {
                console.log(`File closed: ${fileName}`);
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
    }, [roomId, user, authLoading, editor]);

    useEffect(() => {
        if (editor && yDoc) {
            const monacoBinding = new MonacoBinding(yDoc.getText('monaco'), editor.getModel(), new Set([editor]));
            setBinding(monacoBinding);
        }
        return () => {
            binding?.destroy();
        };
    }, [editor, yDoc]);

    // Update editor content when switching files
    useEffect(() => {
        if (editor && files[activeFile]) {
            const currentContent = editor.getValue();
            const fileContent = files[activeFile].content;
            
            if (currentContent !== fileContent) {
                editor.setValue(fileContent);
            }
        }
    }, [activeFile, editor]);

    // Track content changes and update files state
    useEffect(() => {
        if (editor) {
            const handleContentChange = () => {
                const currentContent = editor.getValue();
                setFiles(prev => ({
                    ...prev,
                    [activeFile]: {
                        ...prev[activeFile],
                        content: currentContent
                    }
                }));
            };

            const model = editor.getModel();
            if (model) {
                const disposable = model.onDidChangeContent(handleContentChange);
                return () => disposable.dispose();
            }
        }
    }, [editor, activeFile]);

    if (authLoading) {
        return <div className="loading-screen">Authenticating & Loading Session...</div>;
    }

    return (
        <div className="editor-container">
            
      {/* Header - Your existing header remains exactly the same */}
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
            {/* Connected Users Display - Your existing user display */}
            <div className="connected-users">
                <div className="users-label">
                    <span>👥 {connectedUsers.length} user{connectedUsers.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="users-list">
                    {connectedUsers.map((user) => (
                        <div 
                            key={user.id} 
                            className={`user-avatar ${user.email === currentUser?.email ? 'current-user' : ''}`}
                            title={`${user.name} (${user.email})`}
                        >
                            {user.avatar_url ? (
                                <img src={user.avatar_url} alt={user.name} />
                            ) : (
                                <span className="user-initials">
                                    {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                </span>
                            )}
                        </div>
                    ))}
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

            {/* Toolbar - Your existing toolbar remains exactly the same */}
            <div className="editor-toolbar">
                <div className="toolbar-left">
                    <select value={currentLanguage} onChange={handleLanguageChange} className="language-select">
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                        <option value="html">HTML</option>
                        <option value="css">CSS</option>
                    </select>
                </div>
                <div className="toolbar-right">
                    <Button onClick={handleRunCode} loading={isExecuting} className="run-btn">
                        {isExecuting ? 'Running...' : 'Run Code'}
                    </Button>
                </div>
            </div>

             {/* Main Content - Your existing layout with NEW file tabs */}
             <div className="editor-main-vertical">
                {/* Top Section: Code Editor with NEW File Tabs */}
                <div className="editor-top-section">
                    <div className="editor-panel-full">
                        {/* NEW: File Tabs Component with Bulk Creation */}
                        <FileTabs
                            files={files}
                            activeFile={activeFile}
                            onFileSelect={handleFileSelect}
                            onFileClose={handleFileClose}
                            onNewFile={handleNewFile}
                            onBulkCreateFiles={handleBulkCreateFiles}
                        />
                        
                        {/* Your existing Editor component */}
                        <Editor
                            height="calc(100% - 32px)" // Adjust height for tabs
                            language={currentLanguage}
                            theme="vs-dark"
                            onMount={handleEditorDidMount}
                            options={{ fontSize: 14, minimap: { enabled: false } }}
                        />
                        
                        {/* Your existing CursorManager component */}
                        {editor && socketRef.current && (
                            <CursorManager 
                                editor={editor}
                                socket={socketRef.current}
                                roomId={roomId}
                                currentUser={currentUser}
                                connectedUsers={connectedUsers}
                            />
                        )}
                    </div>
                </div>
                
                {/* Bottom Section: Input and Output - Your existing layout unchanged */}
                <div className="editor-bottom-section">
                    <div className="input-panel-bottom">
                        <div className="input-header">
                            <h3>Input</h3>
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
                    
                    <div className="output-panel-bottom">
                        <div className="output-header">
                            <h3>Output</h3>
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
                                Clear
                            </Button>
                        </div>
                        <div className="output-content">
                            <pre>{output || 'Run your code to see output here...'}</pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default EditorPage;
