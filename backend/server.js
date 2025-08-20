// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Y = require('yjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// --- SUPABASE SETUP WITH YOUR CREDENTIALS ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("ERROR: Supabase URL or Anon Key is missing. Make sure to set them in your Render environment variables.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Connected to YOUR Supabase instance');

const server = http.createServer(app);

// --- UPDATED CORS CONFIGURATION ---
const corsOptions = {
    origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://code-lab-ide.vercel.app"  // Your frontend URL
    ],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
    cors: corsOptions
});

console.log('✅ Socket.io server initialized with CORS for:', corsOptions.origin);

// In-memory storage
const roomDocs = new Map();
const roomStates = new Map();
const roomUsers = new Map();

// --- DATABASE HELPER FUNCTIONS ---
const loadDocFromDB = async (roomId) => {
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
        content: new Uint8Array(Buffer.from(data.content, 'base64')),
        input: data.current_input || '',
        output: data.current_output || ''
    } : null;
};

const saveDocToDB = async (roomId, ydoc) => {
    const content = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    const { error } = await supabase
        .from('rooms')
        .upsert({ id: roomId, content: content }, { onConflict: 'id' });

    if (error) {
        console.error('Error saving doc:', error);
    } else {
        console.log(`Successfully saved doc for room: ${roomId}`);
    }
};

const saveInputOutputToDB = async (roomId, input, output) => {
    const { error } = await supabase
        .from('rooms')
        .update({
            current_input: input || '',
            current_output: output || ''
        })
        .eq('id', roomId);

    if (error) {
        console.error('Error saving input/output:', error);
    } else {
        console.log(`Successfully saved input/output for room: ${roomId}`);
    }
};

// --- API ENDPOINTS ---

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'CodeLab IDE Backend is running!',
        timestamp: new Date().toISOString(),
        cors: corsOptions.origin,
        supabase: 'Connected'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'CodeLab IDE Backend API',
        status: 'running',
        endpoints: {
            health: '/health',
            execute: '/execute'
        },
        timestamp: new Date().toISOString()
    });
});

// --- CODE EXECUTION ENDPOINT ---
app.post('/execute', async (req, res) => {
    console.log("Received request for /execute");
    const { code, language, input } = req.body;

    // Map of supported languages to their Lambda URLs
    const executors = {
        python: 'https://xw5e5ma8xb.execute-api.ap-south-1.amazonaws.com/default/code-executor-python',
        javascript: 'https://n9ztmszd58.execute-api.ap-south-1.amazonaws.com/default/code-executor-javascript',
        cpp: 'https://fntyxwq1p3.execute-api.ap-south-1.amazonaws.com/default/code-executor-cpp'
    };

    const lambdaEndpoint = executors[language];

    if (!lambdaEndpoint) {
        return res.status(400).json({
            error: `Language '${language}' is not supported. Supported languages: ${Object.keys(executors).join(', ')}`
        });
    }

    try {
        console.log(`Executing ${language} code via ${lambdaEndpoint}`);
        const response = await fetch(lambdaEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                input: input || ''
            }),
        });

        console.log("Received response from Lambda.");
        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Lambda execution failed with status:', response.status, 'Body:', errorBody);
            throw new Error(`AWS Lambda responded with status: ${response.status}`);
        }

        const result = await response.json();
        console.log("Raw result from Lambda:", result);

        // Handle different response formats safely
        let finalResult;
        if (result.body && typeof result.body === 'string') {
            try {
                finalResult = JSON.parse(result.body);
                console.log("Parsed body:", finalResult);
            } catch (parseError) {
                console.error("Error parsing result.body:", parseError);
                finalResult = { output: result.body };
            }
        } else if (result.body && typeof result.body === 'object') {
            finalResult = result.body;
        } else {
            finalResult = result;
        }

        res.json(finalResult);
    } catch (error) {
        console.error('CRITICAL ERROR in /execute endpoint:', error);
        res.status(500).json({
            error: 'Failed to execute code.',
            output: `Server error: ${error.message}`
        });
    }
});

// --- SOCKET.IO CONNECTION HANDLING ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    const connectedRooms = new Set();
    let currentUser = null;

    socket.on('join-room', async (data) => {
        const roomId = typeof data === 'string' ? data : data.roomId;
        const user = typeof data === 'object' ? data.user : null;

        socket.join(roomId);
        connectedRooms.add(roomId);
        currentUser = user;

        console.log(`User ${user ? user.email : socket.id} joined room ${roomId}`);

        // Track users in room
        if (user) {
            if (!roomUsers.has(roomId)) {
                roomUsers.set(roomId, new Map());
            }

            roomUsers.get(roomId).set(socket.id, {
                id: socket.id,
                email: user.email,
                name: user.user_metadata?.full_name || user.email,
                avatar_url: user.user_metadata?.avatar_url || null,
                joinedAt: new Date()
            });
        }

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
                console.log(`✅ Loaded from DB - Input: "${dbData.input}", Output: "${dbData.output}"`);
            } else {
                doc.getMap('metadata').set('language', 'javascript');
                console.log(`🆕 New room created: ${roomId}`);
            }
        } else {
            console.log(`🔄 Existing room joined - Input: "${roomState.input}", Output: "${roomState.output}"`);
        }

        const docState = Y.encodeStateAsUpdate(doc);
        socket.emit('doc-sync', docState);

        console.log(`📤 Sending room state to ${socket.id}:`, { input: roomState.input, output: roomState.output });
        socket.emit('room-state-sync', {
            input: roomState.input,
            output: roomState.output
        });

        if (user && roomUsers.has(roomId)) {
            const currentUsers = Array.from(roomUsers.get(roomId).values());
            io.to(roomId).emit('users-update', currentUsers);
        }
    });

    socket.on('doc-update', ({ roomId, update }) => {
        const updateBuffer = new Uint8Array(update);
        const doc = roomDocs.get(roomId);
        if (doc) {
            Y.applyUpdate(doc, updateBuffer);
            socket.to(roomId).emit('doc-update', updateBuffer);
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
        console.log(`User disconnected: ${socket.id}`);

        for (const roomId of connectedRooms) {
            if (roomUsers.has(roomId)) {
                roomUsers.get(roomId).delete(socket.id);
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
                    console.log(`Room ${roomId} is now empty. Saving to DB and clearing from memory.`);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
    console.log(`✅ CodeLab IDE Backend is running!`);
    console.log(`📡 CORS enabled for: ${corsOptions.origin.join(', ')}`);
});
