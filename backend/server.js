// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Y = require('yjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// --- 1. INITIALIZE EXPRESS APP FIRST ---
const app = express();

// --- SUPABASE SETUP ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zwkulpxvixgtgopumgjc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a3VscHh2aXhndGdvcHVtZ2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDcxOTUsImV4cCI6MjA2OTk4MzE5NX0.j2uEXTFkG6MZcAkzUDjgcnB14sfkkmVVsJaiJ8hqqwM';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("ERROR: Supabase URL or Anon Key is missing. Make sure to set them in your environment variables.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Supabase client initialized');

// --- CREATE HTTP SERVER ---
const server = http.createServer(app);

// --- CSP AND SECURITY HEADERS ---
app.use((req, res, next) => {
    // Set appropriate CSP headers to avoid CSP violations
    res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' ws: wss: https:; " +
        "font-src 'self' https:; " +
        "object-src 'none'; " +
        "media-src 'self'; " +
        "frame-src 'none';"
    );
    
    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    next();
});

// --- CORS CONFIGURATION ---
const corsOptions = {
    origin: [
        "http://localhost:5173",           // Local development
        "http://127.0.0.1:5173",          // Alternative local
        "https://codelab-lyart.vercel.app", // Old URL (compatibility)
        "https://code-lab-ide.vercel.app"   // NEW: Your actual Vercel URL
    ],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Handle preflight requests
app.options('*', cors(corsOptions));

// --- SOCKET.IO SETUP ---
const io = new Server(server, {
    cors: corsOptions,
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

console.log('✅ Socket.io server initialized');

// --- IN-MEMORY STORAGE ---
const roomDocs = new Map();
const roomStates = new Map();
const roomUsers = new Map();

// --- DATABASE HELPER FUNCTIONS ---
const loadDocFromDB = async (roomId) => {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select('content, current_input, current_output')
            .eq('id', roomId)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Error loading doc:', error);
            return null;
        }
        
        return data ? {
            content: new Uint8Array(Buffer.from(data.content || '', 'base64')),
            input: data.current_input || '',
            output: data.current_output || ''
        } : null;
    } catch (error) {
        console.error('Database connection error:', error);
        return null;
    }
};

const saveDocToDB = async (roomId, ydoc) => {
    try {
        const content = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
        const { error } = await supabase
            .from('rooms')
            .upsert({ 
                id: roomId, 
                content: content,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
        
        if (error) {
            console.error('Error saving doc:', error);
        } else {
            console.log(`✅ Document saved for room: ${roomId}`);
        }
    } catch (error) {
        console.error('Database save error:', error);
    }
};

const saveInputOutputToDB = async (roomId, input, output) => {
    try {
        const { error } = await supabase
            .from('rooms')
            .update({
                current_input: input || '',
                current_output: output || '',
                updated_at: new Date().toISOString()
            })
            .eq('id', roomId);
        
        if (error) {
            console.error('Error saving input/output:', error);
        } else {
            console.log(`✅ Input/Output saved for room: ${roomId}`);
        }
    } catch (error) {
        console.error('Database update error:', error);
    }
};

// --- API ENDPOINTS ---

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'Backend is running!', 
        timestamp: new Date().toISOString(),
        cors: corsOptions.origin,
        nodeVersion: process.version,
        uptime: process.uptime()
    });
});

// Test endpoint for connectivity
app.get('/test', (req, res) => {
    res.status(200).json({
        message: 'Backend is accessible',
        timestamp: new Date().toISOString()
    });
});

// Mock code execution endpoint
app.post('/api/execute', async (req, res) => {
    console.log("📝 Received request for /api/execute");
    const { code, language, input } = req.body;

    try {
        if (!code) {
            return res.status(400).json({
                error: 'No code provided',
                status: 'Bad Request'
            });
        }

        let output = '';
        
        switch (language?.toLowerCase()) {
            case 'javascript':
                const jsMatches = code.match(/console\.log\([^)]*\)/g);
                if (jsMatches) {
                    output = jsMatches.map(match => {
                        const content = match.match(/console\.log\(([^)]+)\)/)[1];
                        try {
                            if (content.match(/^['"`][^'"`]*['"`]$/)) {
                                return content.slice(1, -1);
                            } else if (content.match(/^\d+$/)) {
                                return content;
                            }
                            return content.replace(/['"]/g, '');
                        } catch {
                            return content.replace(/['"]/g, '');
                        }
                    }).join('\n');
                } else {
                    output = 'JavaScript code executed successfully (no output)';
                }
                break;
                
            case 'python':
                const pyMatches = code.match(/print\([^)]*\)/g);
                if (pyMatches) {
                    output = pyMatches.map(match => {
                        const content = match.match(/print\(([^)]+)\)/)[1];
                        return content.replace(/['"]/g, '');
                    }).join('\n');
                } else {
                    output = 'Python code executed successfully (no output)';
                }
                break;
                
            case 'java':
                const javaMatches = code.match(/System\.out\.println?\([^)]*\)/g);
                if (javaMatches) {
                    output = javaMatches.map(match => {
                        const content = match.match(/System\.out\.println?\(([^)]+)\)/)[1];
                        return content.replace(/['"]/g, '');
                    }).join('\n');
                } else {
                    output = 'Java code compiled and executed successfully (no output)';
                }
                break;
                
            case 'cpp':
            case 'c++':
                const cppMatches = code.match(/cout\s*<<[^;]+/g);
                if (cppMatches) {
                    output = cppMatches.map(match => {
                        let content = match.replace(/cout\s*<<\s*/, '').replace(/\s*<<\s*endl/g, '');
                        return content.replace(/['"]/g, '');
                    }).join('\n');
                } else {
                    output = 'C++ code compiled and executed successfully (no output)';
                }
                break;
                
            case 'c':
                const cMatches = code.match(/printf\([^)]*\)/g);
                if (cMatches) {
                    output = cMatches.map(match => {
                        const content = match.match(/printf\(([^)]+)\)/)[1];
                        return content.replace(/['"]/g, '').replace(/\\n/g, '\n');
                    }).join('');
                } else {
                    output = 'C code compiled and executed successfully (no output)';
                }
                break;
                
            default:
                output = `${language || 'Code'} executed successfully (mock execution)`;
        }

        const result = {
            output: output || 'No output',
            error: null,
            status: 'Completed (Mock Execution)',
            time: '0.001s',
            memory: '1024 KB',
            language: language
        };

        console.log(`✅ Mock execution completed for ${language}`);
        res.status(200).json(result);

    } catch (error) {
        console.error('❌ Execution error:', error);
        res.status(500).json({
            error: 'Code execution failed',
            details: error.message,
            status: 'Internal Error'
        });
    }
});

// Lambda-based execution endpoint (for production)
app.post('/execute', async (req, res) => {
    console.log("🚀 Received request for /execute (Lambda)");
    const { code, language, input } = req.body;

    // Lambda executor endpoints
    const executors = {
        python: process.env.PYTHON_EXECUTOR_URL || 'https://xw5e5ma8xb.execute-api.ap-south-1.amazonaws.com/default/code-executor-python',
        javascript: process.env.JS_EXECUTOR_URL || 'https://n9ztmszd58.execute-api.ap-south-1.amazonaws.com/default/code-executor-javascript',
        cpp: process.env.CPP_EXECUTOR_URL || 'https://fntyxwq1p3.execute-api.ap-south-1.amazonaws.com/default/code-executor-cpp'
    };

    const lambdaEndpoint = executors[language?.toLowerCase()];

    if (!lambdaEndpoint) {
        return res.status(400).json({
            error: `Language '${language}' is not supported for Lambda execution. Supported: ${Object.keys(executors).join(', ')}`
        });
    }

    try {
        console.log(`🔄 Executing ${language} code via Lambda: ${lambdaEndpoint}`);
        
        const response = await fetch(lambdaEndpoint, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'CodeLab-IDE/1.0'
            },
            body: JSON.stringify({
                code: code,
                input: input || ''
            }),
            timeout: 30000 // 30 second timeout
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`❌ Lambda execution failed: ${response.status} - ${errorBody}`);
            throw new Error(`Lambda responded with status: ${response.status}`);
        }

        const result = await response.json();
        console.log("✅ Lambda execution completed");

        // Parse nested response if needed
        let finalResult;
        if (result.body && typeof result.body === 'string') {
            try {
                finalResult = JSON.parse(result.body);
            } catch (parseError) {
                finalResult = { output: result.body };
            }
        } else {
            finalResult = result;
        }

        res.status(200).json(finalResult);

    } catch (error) {
        console.error('❌ Lambda execution error:', error);
        res.status(500).json({
            error: 'Failed to execute code via Lambda.',
            details: error.message,
            fallback: 'Consider using mock execution instead'
        });
    }
});

// --- SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
    console.log(`👤 User connected: ${socket.id}`);
    const connectedRooms = new Set();
    let currentUser = null;

    socket.on('join-room', async (data) => {
        try {
            const roomId = typeof data === 'string' ? data : data?.roomId;
            const user = typeof data === 'object' ? data.user : null;
            
            if (!roomId) {
                socket.emit('error', { message: 'Room ID is required' });
                return;
            }
            
            socket.join(roomId);
            connectedRooms.add(roomId);
            currentUser = user;
            
            console.log(`🏠 User ${user ? user.name || user.email : socket.id} joined room ${roomId}`);

            // Track users in room
            if (user) {
                if (!roomUsers.has(roomId)) {
                    roomUsers.set(roomId, new Map());
                }
                
                roomUsers.get(roomId).set(socket.id, {
                    id: user.id || socket.id,
                    email: user.email,
                    name: user.user_metadata?.username || user.user_metadata?.full_name || user.email || 'Anonymous',
                    avatar_url: user.user_metadata?.avatar_url || null,
                    joinedAt: new Date().toISOString()
                });
            }

            // Load or create document
            let doc = roomDocs.get(roomId);
            let roomState = roomStates.get(roomId);
            
            if (!doc) {
                doc = new Y.Doc();
                roomDocs.set(roomId, doc);
                roomState = { input: '', output: '' };
                roomStates.set(roomId, roomState);
                
                const dbData = await loadDocFromDB(roomId);
                if (dbData) {
                    Y.applyUpdate(doc, dbData.content);
                    roomState.input = dbData.input;
                    roomState.output = dbData.output;
                    console.log(`📥 Loaded existing room data for ${roomId}`);
                } else {
                    doc.getMap('metadata').set('language', 'javascript');
                    console.log(`🆕 Created new room: ${roomId}`);
                }
            }

            // Send initial document state
            const docState = Y.encodeStateAsUpdate(doc);
            socket.emit('doc-sync', docState);
            
            // Send current input/output state
            socket.emit('room-state-sync', {
                input: roomState.input,
                output: roomState.output
            });

            // Send updated user list
            if (user && roomUsers.has(roomId)) {
                const currentUsers = Array.from(roomUsers.get(roomId).values());
                io.to(roomId).emit('users-update', currentUsers);
                socket.to(roomId).emit('user-joined', {
                    id: user.id,
                    name: user.user_metadata?.username || user.email,
                    email: user.email
                });
            }

        } catch (error) {
            console.error('❌ Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // Document synchronization
    socket.on('doc-update', ({ roomId, update }) => {
        try {
            const updateBuffer = new Uint8Array(update);
            const doc = roomDocs.get(roomId);
            if (doc) {
                Y.applyUpdate(doc, updateBuffer);
                socket.to(roomId).emit('doc-update', updateBuffer);
            }
        } catch (error) {
            console.error('❌ Error updating document:', error);
        }
    });

    // Cursor tracking
    socket.on('cursor-position', ({ roomId, position, user }) => {
        if (roomId) {
            socket.to(roomId).emit('cursor-position', {
                userId: socket.id,
                position,
                user
            });
        }
    });

    socket.on('selection-change', ({ roomId, selection, user }) => {
        if (roomId) {
            socket.to(roomId).emit('selection-change', {
                userId: socket.id,
                selection,
                user
            });
        }
    });

    // Language changes
    socket.on('language-change', ({ roomId, language }) => {
        const doc = roomDocs.get(roomId);
        if (doc) {
            doc.getMap('metadata').set('language', language);
            socket.to(roomId).emit('language-changed', language);
        }
    });

    // Input/Output synchronization
    socket.on('input-update', async ({ roomId, input }) => {
        const roomState = roomStates.get(roomId);
        if (roomState) {
            roomState.input = input;
            await saveInputOutputToDB(roomId, input, roomState.output);
        }
        socket.to(roomId).emit('input-sync', input);
    });

    socket.on('output-update', async ({ roomId, output }) => {
        const roomState = roomStates.get(roomId);
        if (roomState) {
            roomState.output = output;
            await saveInputOutputToDB(roomId, roomState.input, output);
        }
        socket.to(roomId).emit('output-sync', output);
    });

    socket.on('code-execution', ({ roomId, isExecuting }) => {
        socket.to(roomId).emit('execution-status', isExecuting);
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
        console.log(`👋 User disconnected: ${socket.id}`);
        
        for (const roomId of connectedRooms) {
            try {
                // Remove user from room tracking
                if (roomUsers.has(roomId)) {
                    const user = roomUsers.get(roomId).get(socket.id);
                    roomUsers.get(roomId).delete(socket.id);
                    
                    if (user) {
                        socket.to(roomId).emit('user-left', user.id);
                    }
                    
                    // Update user list
                    const remainingUsers = Array.from(roomUsers.get(roomId).values());
                    socket.to(roomId).emit('users-update', remainingUsers);
                    
                    if (roomUsers.get(roomId).size === 0) {
                        roomUsers.delete(roomId);
                    }
                }

                // Clean up empty rooms
                const room = io.sockets.adapter.rooms.get(roomId);
                if (!room || room.size === 0) {
                    const docToSave = roomDocs.get(roomId);
                    if (docToSave) {
                        await saveDocToDB(roomId, docToSave);
                        roomDocs.delete(roomId);
                        roomStates.delete(roomId);
                        console.log(`🧹 Cleaned up empty room: ${roomId}`);
                    }
                }
            } catch (error) {
                console.error('❌ Error during disconnect cleanup:', error);
            }
        }
    });

    // Error handling
    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// --- ERROR HANDLING MIDDLEWARE ---
app.use((err, req, res, next) => {
    console.error('❌ Express error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`🚀 CodeLab IDE Backend server running on port ${PORT}`);
    console.log(`📡 CORS enabled for origins:`, corsOptions.origin);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    
    if (process.env.NODE_ENV === 'production') {
        console.log(`🌐 Production URL: https://codelab-backend-q5m7.onrender.com`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Process terminated');
        process.exit(0);
    });
});
