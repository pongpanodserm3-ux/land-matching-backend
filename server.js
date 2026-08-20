const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY is not set!");
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Backend Server running on port ${PORT}`);

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
