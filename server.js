const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { Pool } = require('pg');

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY is not set!");
}

// 1. สร้าง Express และ HTTP Server เพื่อรองรับทั้ง HTTP Route (แก้ปัญหา Upgrade Required) และ WebSocket
const app = express();
const server = http.createServer(app);

// HTTP Route พื้นฐาน สำหรับเช็กสถานะเซิร์ฟเวอร์
app.get('/', (req, res) => {
    res.status(200).send('Land Matching Backend Server is running successfully! 🚀');
});

// ตัวอย่าง API สำหรับเชื่อมต่อฐานข้อมูล Supabase (10 ตาราง)
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

// 3. คงโครงสร้าง WebSocketServer เดิมของคุณไว้ทั้งหมด
const wss = new WebSocketServer({ server });

wss.on('connection', (clientSocket) => {
    console.log('Client connected');

    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    const geminiSocket = new WebSocket(geminiUrl);
    
    // 🛠️ สร้าง Queue ไว้เก็บข้อมูล (เช่น setupData) ในระหว่างที่ Gemini ยังเชื่อมต่อไม่เสร็จ
    const messageQueue = [];

    geminiSocket.on('open', () => {
        console.log('Connected to Gemini Live API');
        // เมื่อ Gemini พร้อมแล้ว ให้ทยอยส่งข้อมูลที่ค้างอยู่ใน Queue ออกไปให้หมด
        while (messageQueue.length > 0) {
            const msg = messageQueue.shift();
            geminiSocket.send(msg);
        }
    });

    clientSocket.on('message', (message) => {
        const msgString = message.toString();
        // ถ้า Gemini พร้อมแล้ว ส่งตรงได้เลย
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.send(msgString);
        } else {
            // ถ้ายังไม่พร้อม ให้เก็บใส่ Queue ไว้ก่อน ป้องกันข้อมูลสูญหาย
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

// 4. เปลี่ยนมารันผ่าน server.listen และผูกกับ '0.0.0.0' เพื่อให้ Render ทำงานได้อย่างสมบูรณ์
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Server running on port ${PORT}`);
});
