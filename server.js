const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { Pool } = require('pg');
const cors = require('cors');

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY is not set!");
}

// 1. สร้าง Express และ HTTP Server
const app = express();

// เปิดใช้งาน CORS สำหรับโดเมน GitHub Pages และ Localhost
app.use(cors({
    origin: ['https://pongpanodserm3-ux.github.io', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// รองรับการแปลง JSON body สำหรับ POST request
app.use(express.json());

const server = http.createServer(app);

// HTTP Route พื้นฐาน สำหรับเช็กสถานะเซิร์ฟเวอร์
app.get('/', (req, res) => {
    res.status(200).send('Land Matching Backend Server is running successfully! 🚀');
});

// ดึงข้อมูลจาก public.properties และเรียงลำดับตาม property_id
app.post('/api/properties', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM public.properties ORDER BY property_id ASC;');
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ตัวอย่าง API สำหรับเชื่อมต่อฐานข้อมูล Supabase (users)
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users LIMIT 10;');
        res.status(200).json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. เชื่อมต่อฐานข้อมูล PostgreSQL บน Supabase
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Database connection error:', err.stack);
    } else {
        console.log('✅ Connected to Supabase PostgreSQL successfully!');
        release();
    }
});

// 3. คงโครงสร้าง WebSocketServer เดิมของคุณไว้ทั้งหมด[cite: 3]
const wss = new WebSocketServer({ server });

wss.on('connection', (clientSocket) => {
    console.log('Client connected');

    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    const geminiSocket = new WebSocket(geminiUrl);
    
    const messageQueue = [];

    geminiSocket.on('open', () => {
        console.log('Connected to Gemini Live API');
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            geminiSocket.send(msg);
        }
    });

    clientSocket.on('message', (message) => {
        const msgString = message.toString();
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.send(msgString);
        } else {
            messageQueue.push(msgString);
        }
    });

    geminiSocket.on('message', (message) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(message.toString());
        }
    });

    geminiSocket.on('close', (code, reason) => {
        console.log(`Gemini Closed: Code ${code}, Reason: ${reason}`);
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.close();
        }
    });

    clientSocket.on('close', () => {
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.close();
        }
    });

    geminiSocket.on('error', (err) => {
        console.error('Gemini Socket Error:', err);
    });

    clientSocket.on('error', (err) => {
        console.error('Client Socket Error:', err);
    });
});

// 4. รันเซิร์ฟเวอร์[cite: 3]
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Server running on port ${PORT}`);
});
