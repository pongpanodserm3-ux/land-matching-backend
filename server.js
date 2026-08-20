const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const wss = new WebSocketServer({ port: PORT });
console.log(`Backend Server running on port ${PORT}`);

wss.on('connection', (clientSocket) => {
    console.log('Client connected');

    // กำหนดชื่อโมเดล Gemini 3.1 Flash Live Preview
    const model = "models/gemini-3.1-flash-live-preview";
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    
    const geminiSocket = new WebSocket(geminiUrl);

    geminiSocket.on('open', () => {
        console.log('Connected to Gemini Live API');
        
        // ส่ง Setup Message ทันทีที่เชื่อมต่อสำเร็จ
        const setupMessage = {
            setup: {
                model: model,
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    thinkingConfig: {
                        thinkingLevel: "minimal"
                    }
                }
            }
        };
        geminiSocket.send(JSON.stringify(setupMessage));
    });

    // ส่งต่อข้อมูลระหว่าง Client และ Gemini ผ่าน Proxy
    clientSocket.on('message', (message) => {
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.send(message);
        }
    });

    geminiSocket.on('message', (message) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(message);
        }
    });

    geminiSocket.on('close', (code, reason) => {
        console.log(`Gemini Closed: Code ${code}, Reason: ${reason}`);
        clientSocket.close();
    });

    clientSocket.on('close', () => {
        if (geminiSocket.readyState === WebSocket.OPEN) {
            geminiSocket.close();
        }
    });
});
