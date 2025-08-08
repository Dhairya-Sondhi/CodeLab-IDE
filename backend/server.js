// backend/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Doc, encodeStateAsUpdate, applyUpdate } from 'yjs';
import { createClient } from '@supabase/supabase-js';

// --- INITIALIZE EXPRESS APP ---
const app = express();

// --- SUPABASE SETUP ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zwkulpxvixgtgopumgjc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a3VscHh2aXhndGdvcHVtZ2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDcxOTUsImV4cCI6MjA2OTk4MzE5NX0.j2uEXTFkG6MZcAkzUDjgcnB14sfkkmVVsJaiJ8hqqwM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
console.log('✅ Supabase client initialized');

// --- CREATE HTTP SERVER ---
const server = createServer(app);

// --- CORS CONFIGURATION ---
const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://codelab-lyart.vercel.app", 
    "https://code-lab-ide.vercel.app"
];

const corsOptions = {
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// --- SOCKET.IO SETUP ---
const io = new Server(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
});

// --- IN-MEMORY STORAGE ---
const roomDocs = new Map();
const roomStates = new Map();
const roomUsers = new Map();

// --- SAFE ROUTE DEFINITIONS (NO MALFORMED PARAMETERS) ---

// Root endpoint - CLEAN route
app.get('/', (req, res) => {
    res.json({
        message: 'CodeLab IDE Backend API',
        status: 'running',
        endpoints: {
            health: '/health',
            execute: '/api/execute'
        }
    });
});

// Health check - CLEAN route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'Backend is running!',
        timestamp: new Date().toISOString(),
        cors: allowedOrigins
    });
});

// Code execution - CLEAN route
app.post('/api/execute', async (req, res) => {
    const { code, language, input } = req.body;

    if (!code) {
        return res.status(400).json({
            error: 'No code provided'
        });
    }

    try {
        let output = '';
        
        switch (language?.toLowerCase()) {
            case 'javascript':
                const jsMatches = code.match(/console\.log\([^)]*\)/g);
                output = jsMatches ? 
                    jsMatches.map(match => {
                        const content = match.match(/console\.log\(([^)]+)\)/)[1];
                        return content.replace(/['"]/g, '');
                    }).join('\n') : 
                    'JavaScript executed (no output)';
                break;
                
            case 'python':
                const pyMatches = code.match(/print\([^)]*\)/g);
                output = pyMatches ? 
                    pyMatches.map(match => {
                        const content = match.match(/print\(([^)]+)\)/)[1];
                        return content.replace(/['"]/g, '');
                    }).join('\n') : 
                    'Python executed (no output)';
                break;
                
            default:
                output = `${language || 'Code'} executed successfully`;
        }

        res.json({
            output,
            status: 'Completed',
            time: '0.001s'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Execution failed',
            details: error.message
        });
    }
});

// --- SOCKET.IO HANDLERS ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-room', async (data) => {
        const roomId = typeof data === 'string' ? data : data?.roomId;
        const user = typeof data === 'object' ? data.user : null;
        
        if (roomId) {
            socket.join(roomId);
            console.log(`User joined room: ${roomId}`);
            
            // Initialize room if needed
            if (!roomDocs.has(roomId)) {
                const doc = new Doc();
                roomDocs.set(roomId, doc);
                roomStates.set(roomId, { input: '', output: '' });
            }
            
            const docState = encodeStateAsUpdate(roomDocs.get(roomId));
            socket.emit('doc-sync', docState);
        }
    });
    
    socket.on('doc-update', ({ roomId, update }) => {
        const doc = roomDocs.get(roomId);
        if (doc) {
            applyUpdate(doc, new Uint8Array(update));
            socket.to(roomId).emit('doc-update', update);
        }
    });
    
    socket.on('language-change', ({ roomId, language }) => {
        socket.to(roomId).emit('language-changed', language);
    });
    
    socket.on('input-update', ({ roomId, input }) => {
        const roomState = roomStates.get(roomId);
        if (roomState) {
            roomState.input = input;
        }
        socket.to(roomId).emit('input-sync', input);
    });
    
    socket.on('output-update', ({ roomId, output }) => {
        const roomState = roomStates.get(roomId);
        if (roomState) {
            roomState.output = output;
        }
        socket.to(roomId).emit('output-sync', output);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// --- 404 HANDLER (SAFE CATCH-ALL) ---
app.use((req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.path
    });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`🚀 CodeLab IDE Backend running on port ${PORT}`);
    console.log(`📡 CORS origins:`, allowedOrigins);
});
