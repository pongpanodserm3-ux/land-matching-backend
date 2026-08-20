const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const wss = new WebSocketServer({ port: PORT });
console.log(`Backend Server running on port ${PORT}`);

wss.on('connection', (clientSocket) => {
    console.log('Client connected');

    // เชื่อมต่อไปยัง Gemini Live API ด้วยโมเดลล่าสุด Gemini 3.1 Flash
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    
    const geminiSocket = new WebSocket(geminiUrl);

    geminiSocket.on('open', () => {
        console.log('Connected to Gemini Live API');
    });

    // รับข้อมูลจาก Browser -> ส่งต่อให้ Gemini
    clientSocket.on('message', (message) => {
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.send(message.toString());
        }
    });

    // รับข้อมูลจาก Gemini -> ส่งกลับให้ Browser
    geminiSocket.on('message', (data) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(data.toString());
        }
    });

    // ดักจับข้อผิดพลาดจาก Gemini
    geminiSocket.on('close', (event) => {
        console.log(`Gemini Closed: Code ${event.code}, Reason: ${event.reason}`);
        clientSocket.close();
    });

    geminiSocket.on('error', (err) => {
        console.error('Gemini Socket Error:', err);
    });

    clientSocket.on('close', () => {
        geminiSocket.close();
    });
});
