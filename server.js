const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const wss = new WebSocketServer({ port: PORT });
console.log(`Backend Server running on port ${PORT}`);

wss.on('connection', (clientSocket) => {
    console.log('Client connected');

    // เปลี่ยนจาก v1alpha เป็น v1beta และระบุโมเดลให้ถูกต้องตามมาตรฐาน Live API
    const model = "models/gemini-2.5-flash"; // หรือรุ่นที่รองรับ Live API ตามที่คุณใช้งาน
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
    
    const geminiSocket = new WebSocket(geminiUrl);

    geminiSocket.on('open', () => {
        console.log('Connected to Gemini Live API');
        
        // ส่ง Setup Message ทันทีที่เชื่อมต่อสำเร็จ เพื่อไม่ให้ Gemini ตัดสาย
        const setupMessage = {
            setup: {
                model: model,
                generationConfig: {
                    responseModalities: ["TEXT"] // ปรับเป็น ["AUDIO"] ได้หากทำระบบเสียง
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
