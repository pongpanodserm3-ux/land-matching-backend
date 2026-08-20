const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const wss = new WebSocketServer({ port: PORT });
console.log(`Backend Server running on port ${PORT}`);

wss.on('connection', (clientSocket) => {
    console.log('Client connected');

    // ใช้ v1alpha สำหรับ Gemini Live Multimodal WebSocket API
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    
    const geminiSocket = new WebSocket(geminiUrl);

    geminiSocket.on('open', () => {
        console.log('Connected to Gemini Live API');
    });

    // รับข้อมูลจาก Frontend แล้วยิงต่อให้ Gemini API โดยตรง
    clientSocket.on('message', (message) => {
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.send(message);
        }
    });

    // รับข้อมูลจาก Gemini API แล้วส่งกลับให้ Frontend
    geminiSocket.on('message', (message) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(message);
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
