// backend/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Doc, encodeStateAsUpdate, applyUpdate } from 'yjs';
import { createClient } from '@supabase/supabase-js';

const app = express();
const server = createServer(app);

// --- SUPABASE SETUP ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zwkulpxvixgtgopumgjc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a3VscHh2aXhndGdvcHVtZ2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDcxOTUsImV4cCI6MjA2OTk4MzE5NX0.j2uEXTFkG6MZcAkzUDjgcnB14sfkkmVVsJaiJ8hqqwM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Supabase client initialized');

// --- CLEAN CORS CONFIGURATION (YOUR URLS ONLY) ---
const allowedOrigins = [
    "http://localhost:5173",        // Local development
    "http://127.0.0.1:5173",       // Alternative local
    "https://code-lab-ide.vercel.app"  // YOUR PRODUCTION URL ONLY
];

console.log('🔧 CORS configured for origins:', allowedOrigins);

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            console.log(`✅ CORS allowing origin: ${origin}`);
            callback(null, true);
        } else {
            console.log(`❌ CORS blocking origin: ${origin}`);
            console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// --- SOCKET.IO WITH YOUR CORS ONLY ---
const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Override headers for Socket.io handshake
io.engine.on('initial_headers', (headers, req) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
        console.log(`✅ Socket.io allowing origin: ${origin}`);
    } else {
        console.log(`❌ Socket.io blocking origin: ${origin}`);
    }
});

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
        const content = Buffer.from(encodeStateAsUpdate(ydoc)).toString('base64');
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
        }
    } catch (error) {
        console.error('Database update error:', error);
    }
};

// --- API ENDPOINTS ---
app.get('/', (req, res) => {
    res.json({
        message: 'CodeLab IDE Backend',
        status: 'running',
        allowedOrigins: allowedOrigins,
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'Backend is running!',
        timestamp: new Date().toISOString(),
        cors: allowedOrigins,
        socketConnections: io.engine.clientsCount
    });
});

app.post('/api/execute', async (req, res) => {
    const { code, language, input } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    try {
        let output = '';
        
        switch (language?.toLowerCase()) {
            case 'javascript':
                const jsMatches = code.match(/console\.log\([^)]*\)/g);
                if (jsMatches) {
                    output = jsMatches.map(match => {
                        const content = match.match(/console\.log\(([^)]+)\)/)[1];
                        return content.replace(/['"]/g, '');
                    }).join('\n');
                } else {
                    output = 'JavaScript executed (no output)';
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
                    output = 'Python executed (no output)';
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
                    output = 'Java executed (no output)';
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
                    output = 'C++ executed (no output)';
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
                    output = 'C executed (no output)';
                }
                break;
                
            default:
                output = `${language || 'Code'} executed successfully`;
        }

        res.json({
            output: output || 'No output',
            status: 'Completed (Mock Execution)',
            time: '0.001s',
            memory: '1024 KB'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Code execution failed',
            details: error.message
        });
    }
});

// --- SOCKET.IO HANDLERS ---
io.on('connection', (socket) => {
    console.log(`👤 User connected: ${socket.id}`);
    const connectedRooms = new Set();

    socket.on('join-room', async (data) => {
        try {
            const roomId = typeof data === 'string' ? data : data?.roomId;
            const user = typeof data === 'object' ? data.user : null;
            
            if (!roomId) {
                socket.emit('error', { message: 'Room ID required' });
                return;
            }
            
            socket.join(roomId);
            connectedRooms.add(roomId);
            
            console.log(`🏠 User joined room: ${roomId}`);

            // Track users
            if (user) {
                if (!roomUsers.has(roomId)) {
                    roomUsers.set(roomId, new Map());
                }
                
                roomUsers.get(roomId).set(socket.id, {
                    id: user.id || socket.id,
                    email: user.email,
                    name: user.user_metadata?.username || user.email || 'Anonymous',
                    avatar_url: user.user_metadata?.avatar_url || null,
                    joinedAt: new Date().toISOString()
                });
            }

            // Load or create document
            let doc = roomDocs.get(roomId);
            let roomState = roomStates.get(roomId);
            
            if (!doc) {
                doc = new Doc();
                roomDocs.set(roomId, doc);
                roomState = { input: '', output: '' };
                roomStates.set(roomId, roomState);
                
                const dbData = await loadDocFromDB(roomId);
                if (dbData) {
                    applyUpdate(doc, dbData.content);
                    roomState.input = dbData.input;
                    roomState.output = dbData.output;
                } else {
                    doc.getMap('metadata').set('language', 'javascript');
                }
            }

            // Send initial state
            const docState = encodeStateAsUpdate(doc);
            socket.emit('doc-sync', docState);
            socket.emit('room-state-sync', {
                input: roomState.input,
                output: roomState.output
            });

            // Send user list
            if (user && roomUsers.has(roomId)) {
                const currentUsers = Array.from(roomUsers.get(roomId).values());
                io.to(roomId).emit('users-update', currentUsers);
                socket.to(roomId).emit('user-joined', user);
            }

        } catch (error) {
            console.error('❌ Error joining room:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on('doc-update', ({ roomId, update }) => {
        const doc = roomDocs.get(roomId);
        if (doc) {
            applyUpdate(doc, new Uint8Array(update));
            socket.to(roomId).emit('doc-update', update);
        }
    });

    socket.on('cursor-position', ({ roomId, position, user }) => {
        if (roomId) {
            socket.to(roomId).emit('cursor-position', {
                userId: socket.id,
                position,
                user
            });
        }
    });

    socket.on('language-change', ({ roomId, language }) => {
        const doc = roomDocs.get(roomId);
        if (doc) {
            doc.getMap('metadata').set('language', language);
            socket.to(roomId).emit('language-changed', language);
        }
    });

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

    socket.on('disconnect', async () => {
        console.log(`👋 User disconnected: ${socket.id}`);
        
        for (const roomId of connectedRooms) {
            try {
                if (roomUsers.has(roomId)) {
                    const user = roomUsers.get(roomId).get(socket.id);
                    roomUsers.get(roomId).delete(socket.id);
                    
                    if (user) {
                        socket.to(roomId).emit('user-left', user.id);
                    }
                    
                    const remainingUsers = Array.from(roomUsers.get(roomId).values());
                    socket.to(roomId).emit('users-update', remainingUsers);
                    
                    if (roomUsers.get(roomId).size === 0) {
                        roomUsers.delete(roomId);
                    }
                }

                const room = io.sockets.adapter.rooms.get(roomId);
                if (!room || room.size === 0) {
                    const docToSave = roomDocs.get(roomId);
                    if (docToSave) {
                        await saveDocToDB(roomId, docToSave);
                        roomDocs.delete(roomId);
                        roomStates.delete(roomId);
                    }
                }
            } catch (error) {
                console.error('❌ Error during disconnect:', error);
            }
        }
    });

    socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
    });
});

// --- ERROR HANDLERS ---
app.use((err, req, res, next) => {
    console.error('❌ Express error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path,
        availableEndpoints: ['/', '/health', '/api/execute']
    });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`🚀 CodeLab IDE Backend running on port ${PORT}`);
    console.log(`📡 YOUR CORS origins: ${allowedOrigins.join(', ')}`);
    console.log(`🔗 Health: /health | Execute: /api/execute`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down gracefully...');
    server.close(() => {
        process.exit(0);
    });
});
