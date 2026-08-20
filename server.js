const { WebSocketServer, WebSocket } = require('ws');

// Render จะกำหนด PORT ให้อัตโนมัติ
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const wss = new WebSocketServer({ port: PORT });
console.log(`Backend Server running on port ${PORT}`);

wss.on('connection', (clientSocket) => {
    console.log('Client connected');

    // เชื่อมต่อไปยัง Gemini Live API ด้วย API Key จาก Environment Variable
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    const geminiSocket = new WebSocket(geminiUrl);

    // ส่งต่อข้อมูลจาก Browser -> Gemini
    clientSocket.on('message', (message) => {
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.send(message.toString());
        }
    });

    // ส่งต่อข้อมูลจาก Gemini -> Browser
    geminiSocket.on('message', (data) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(data.toString());
        }
    });

    clientSocket.on('close', () => geminiSocket.close());
    geminiSocket.on('close', () => clientSocket.close());
    geminiSocket.on('error', (err) => console.error('Gemini Error:', err));
});