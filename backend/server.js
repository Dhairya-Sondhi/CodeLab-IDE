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
const SUPABASE_URL = 'https://zwkulpxvixgtgopumgjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a3VscHh2aXhndGdvcHVtZ2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDcxOTUsImV4cCI6MjA2OTk4MzE5NX0.j2uEXTFkG6MZcAkzUDjgcnB14sfkkmVVsJaiJ8hqqwM';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("ERROR: Supabase URL or Anon Key is missing. Make sure to set them in your Render environment variables.");
    process.exit(1);
} // Fixed: Added missing closing brace

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// --- END SUPABASE SETUP ---

const server = http.createServer(app);

// --- FIXED CORS CONFIGURATION ---
const corsOptions = {
    origin: [
        "http://localhost:5173",           // Local development
        "http://127.0.0.1:5173",          // Alternative local
        "https://code-lab-ide.vercel.app" // Production frontend
    ],
    methods: ["GET", "POST"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json()); // Express JSON parser

const io = new Server(server, {
    cors: corsOptions
});
// --- END CORS CONFIGURATION ---

// In-memory storage for active room documents
const roomDocs = new Map();
const roomStates = new Map(); // For input/output
const roomUsers = new Map(); // Track users in each room

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
// --- END DATABASE HELPER FUNCTIONS ---

// --- API ROUTES ---
// Fixed: Added the missing /api/execute route
app.post('/api/execute', async (req, res) => {
    console.log("Received request for /api/execute");
    const { code, language, input } = req.body;

    try {
        // Mock execution for development
        let output = '';
        
        switch (language) {
            case 'javascript':
                const jsMatches = code.match(/console\.log\([^)]*\)/g);
                if (jsMatches) {
                    output = jsMatches.map(match => {
                        const content = match.match(/console\.log\(([^)]+)\)/)[1];
                        return content.replace(/['"]/g, '');
                    }).join('\n');
                } else {
                    output = 'JavaScript code executed successfully';
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
                    output = 'Python code executed successfully';
                }
                break;
                
            default:
                output = `${language} code executed successfully`;
        }

        res.json({
            output: output || 'No output',
            status: 'Completed',
            time: '0.001',
            memory: '1024'
        });

    } catch (error) {
        console.error('Execution error:', error);
        res.status(500).json({
            error: 'Code execution failed',
            details: error.message
        });
    }
});

// Keep your existing /execute endpoint for Python
app.post('/execute', async (req, res) => {
    console.log("Received request for /execute");
    const { code, language, input } = req.body;

    if (language !== 'python') {
        return res.status(400).json({ error: 'Only Python execution is currently supported.' });
    }

    try {
        const lambdaEndpoint = 'https://xw5e5ma8xb.execute-api.ap-south-1.amazonaws.com/default/code-executor-python';
        console.log("Calling AWS Lambda endpoint...");
        
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
        res.status(500).json({ error: 'Failed to execute code.' });
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
        
        console.log(`User ${user ? user.name || user.email : socket.id} joined room ${roomId}`);

        // Track users in room
        if (user) {
            if (!roomUsers.has(roomId)) {
                roomUsers.set(roomId, new Map());
            }
            
            roomUsers.get(roomId).set(socket.id, {
                id: user.id || socket.id,
                email: user.email,
                name: user.name || user.user_metadata?.username || user.email,
                avatar_url: user.user_metadata?.avatar_url || null,
                joinedAt: new Date()
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
                console.log(`✅ Loaded from DB - Input: "${dbData.input}", Output: "${dbData.output}"`);
            } else {
                doc.getMap('metadata').set('language', 'javascript');
                console.log(`🆕 New room created: ${roomId}`);
            }
        } else {
            console.log(`🔄 Existing room joined - Input: "${roomState.input}", Output: "${roomState.output}"`);
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
            socket.to(roomId).emit('user-joined', user);
        }
    });

    // Document updates
    socket.on('doc-update', ({ roomId, update }) => {
        const updateBuffer = new Uint8Array(update);
        const doc = roomDocs.get(roomId);
        if (doc) {
            Y.applyUpdate(doc, updateBuffer);
            socket.to(roomId).emit('doc-update', updateBuffer);
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

    // Input/Output sync
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
        console.log(`User disconnected: ${socket.id}`);
        
        for (const roomId of connectedRooms) {
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
                    console.log(`Room ${roomId} is now empty. Saving to DB and clearing from memory.`);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
});
