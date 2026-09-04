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

// ฟังก์ชันคำนวณระยะทางระหว่างพิกัด 2 จุดด้วยสูตร Haversine Formula (กิโลเมตร)
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // รัศมีโลก (กม.)
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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

// ดึงข้อมูลจาก public.properties และรองรับการค้นหาตามเงื่อนไข / ลิสต์บ้านวันล่าสุด
app.post('/api/properties', async (req, res) => {
    try {
        const offset = parseInt(req.body.offset || 0, 10);
        const limit = parseInt(req.body.limit || 10, 10);
        const rawCriteria = req.body.criteria || {};
        const searchText = (req.body.searchText || "").trim();

        // ดึงค่าพิกัดละติจูด ลองติจูด และรัศมีจาก criteria
        const targetLat = parseFloat(rawCriteria.lat !== undefined ? rawCriteria.lat : rawCriteria.latitude);
        const targetLng = parseFloat(rawCriteria.lng !== undefined ? rawCriteria.lng : rawCriteria.longitude);
        const radiusKm = !isNaN(parseFloat(rawCriteria.radius)) ? parseFloat(rawCriteria.radius) : 1;
        const hasLocationFilter = !isNaN(targetLat) && !isNaN(targetLng);

        // รายการข้อความที่เป็น "หัวข้อปุ่ม Dropdown" ให้ตัดทิ้ง ไม่นำมากรอง
        const defaultLabels = ["พิกัด", "ขาย/เช่า", "คอนโด/บ้าน", "ราคาขาย", "ราคาเช่า", "ทั้งหมด", "เลือกจังหวัด", "เลือกอำเภอ", "เลือกถนน", "เลือกโครงการ"];

        // กรองเอาเฉพาะเงื่อนไขที่ผู้ใช้เลือกใช้งานจริงๆ
        const criteria = {};
        for (const [key, val] of Object.entries(rawCriteria)) {
            if (["lat", "lng", "latitude", "longitude", "radius"].includes(key)) continue;
            if (val && typeof val === 'string' && !defaultLabels.includes(val.trim())) {
                criteria[key] = val.trim();
            }
        }

        const hasCriteria = Object.keys(criteria).length > 0;
        const hasSearchText = searchText !== "";

        let queryStr = "";
        let queryParams = [];

        let whereClauses = [];
        let paramIndex = 1;

        if (hasSearchText) {
            const keywords = searchText.split(/\s+/);
            keywords.forEach(kw => {
                whereClauses.push(`(facebook_name ILIKE $${paramIndex} OR project ILIKE $${paramIndex} OR property_type ILIKE $${paramIndex} OR province ILIKE $${paramIndex} OR district ILIKE $${paramIndex} OR road ILIKE $${paramIndex} OR details ILIKE $${paramIndex})`);
                queryParams.push(`%${kw}%`);
                paramIndex++;
            });
        }

        if (criteria.province) { whereClauses.push(`province ILIKE $${paramIndex}`); queryParams.push(`%${criteria.province}%`); paramIndex++; }
        if (criteria.district) { whereClauses.push(`district ILIKE $${paramIndex}`); queryParams.push(`%${criteria.district}%`); paramIndex++; }
        if (criteria.road) { whereClauses.push(`road ILIKE $${paramIndex}`); queryParams.push(`%${criteria.road}%`); paramIndex++; }
        if (criteria.propertyType) { whereClauses.push(`property_type ILIKE $${paramIndex}`); queryParams.push(`%${criteria.propertyType}%`); paramIndex++; }
        if (criteria.project) { whereClauses.push(`project ILIKE $${paramIndex}`); queryParams.push(`%${criteria.project}%`); paramIndex++; }
        if (criteria.priceType) { whereClauses.push(`price_type ILIKE $${paramIndex}`); queryParams.push(`%${criteria.priceType}%`); paramIndex++; }

        let whereSQL = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

        if (!hasCriteria && !hasSearchText && !hasLocationFilter) {
            // โลจิกที่ 1: ไม่มีตัวกรองใดๆ ให้ดึงรายการบ้านของวันอัปเดตล่าสุด
            const latestDateResult = await pool.query(`SELECT MAX(date) as max_date FROM public.properties WHERE date IS NOT NULL AND date != ''`);
            const maxDate = latestDateResult.rows[0]?.max_date;

            if (maxDate) {
                queryStr = `SELECT * FROM public.properties WHERE date = $1 ORDER BY property_id ASC LIMIT $2 OFFSET $3;`;
                queryParams = [maxDate, limit, offset];
            } else {
                queryStr = `SELECT * FROM public.properties ORDER BY property_id ASC LIMIT $1 OFFSET $2;`;
                queryParams = [limit, offset];
            }
        } else if (hasLocationFilter) {
            // โลจิกค้นหาด้วยพิกัด/รัศมี: ดึงรายการที่ตรงตามเงื่อนไขข้อความทั้งหมดมาก่อนเพื่อมาคำนวณระยะทาง
            queryStr = `SELECT * FROM public.properties ${whereSQL} ORDER BY property_id ASC;`;
        } else {
            // โลจิกที่ 2: มีการเลือกตัวกรองปกติ
            queryStr = `SELECT * FROM public.properties ${whereSQL} ORDER BY property_id ASC LIMIT $${paramIndex} OFFSET $${paramIndex+1};`;
            queryParams.push(limit, offset);
        }

        const result = await pool.query(queryStr, queryParams);
        let rows = result.rows;

        // หากมีการกรองด้วยพิกัดและรัศมี (Haversine Filter)
        if (hasLocationFilter) {
            rows = rows.filter(row => {
                const itemLat = parseFloat(row.latitude || row.lat || row.use_lat || row.use);
                const itemLng = parseFloat(row.longitude || row.lng || row.use2_lng || row.use2);

                if (!isNaN(itemLat) && !isNaN(itemLng)) {
                    const distKm = getDistanceInKm(targetLat, targetLng, itemLat, itemLng);
                    row._distance = distKm;
                    return distKm <= radiusKm;
                }
                return false;
            });

            // เรียงลำดับอสังหาริมทรัพย์จากระยะทางที่ใกล้ศูนย์กลางพิกัดมากที่สุดขึ้นก่อน
            rows.sort((a, b) => (a._distance || 0) - (b._distance || 0));

            // ทำ Pagination บน Memory สำหรับผลลัพธ์ที่กรองรัศมีแล้ว
            rows = rows.slice(offset, offset + limit);
        }

        const mappedResults = rows.map(row => ({
            ...row,
            postId: row.post_id || row.property_id || "",
            salePrice: row.price_sell || row.price || "",
            rentPrice: row.price_rent || "",
            facebookPostName: row.facebook_name || "",
            postDetails: row.details || "",
            latitude: row.latitude || row.lat || row.use_lat || row.use || "",
            longitude: row.longitude || row.lng || row.use2_lng || row.use2 || ""
        }));

        res.status(200).json({
            status: 'success',
            results: mappedResults,
            nextOffset: offset + mappedResults.length,
            hasMore: mappedResults.length === limit
        });
    } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({ status: 'error', message: error.message });
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

// 3. คงโครงสร้าง WebSocketServer เดิมของคุณไว้ทั้งหมด
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

// 4. รันเซิร์ฟเวอร์
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Server running on port ${PORT}`);
});
