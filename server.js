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

// --- Helper Functions นำมาจาก Logic เดิม 100% line35-60--- 
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function parseAreaToSqWah(sizeStr) {
    if (!sizeStr) return NaN;
    let str = String(sizeStr).trim();
    let totalSqWah = 0;
    const raiMatch = str.match(/([0-9.]+)\s*ไร่/);
    const nganMatch = str.match(/([0-9.]+)\s*งาน/);
    const wahMatch = str.match(/([0-9.]+)\s*(?:ตร\.?วา|ตารางวา)/);
    if (raiMatch) totalSqWah += parseFloat(raiMatch[1]) * 400;
    if (nganMatch) totalSqWah += parseFloat(nganMatch[1]) * 100;
    if (wahMatch) totalSqWah += parseFloat(wahMatch[1]);
    if (!raiMatch && !nganMatch && !wahMatch) {
        const numOnly = parseFloat(str.replace(/[^0-9.]/g, ''));
        return isNaN(numOnly) ? NaN : numOnly;
    }
    return totalSqWah;
}

// API สำหรับรับเงื่อนไขและดึงข้อมูลจาก Supabase Line62-222
app.post('/api/properties', async (req, res) => {
    try {
        const offset = parseInt(req.body.offset || 0, 10);
        const limit = parseInt(req.body.limit || 10, 10);
        const criteria = req.body.criteria || {};
        const searchText = req.body.searchText || "";
        
        // 1. ดึงข้อมูลจาก Supabase
        const result = await pool.query('SELECT * FROM public.properties ORDER BY property_id ASC;');
        
        let rawResults = result.rows.map(dbRow => {
            return {
                ...dbRow,
                // ตรวจสอบชื่อฟิลด์จาก Database ให้ครอบคลุมทั้งตัวพิมพ์เล็กและใหญ่
                facebookPostName: dbRow.facebook_name || dbRow.facebookPostName || "",
                project: dbRow.project || dbRow.Project || "",
                propertyType: dbRow.property_type || dbRow.propertyType || "",
                province: dbRow.province || dbRow.Province || "",
                district: dbRow.district || dbRow.District || "",
                road: dbRow.road || dbRow.Road || "",
                priceType: dbRow.price_type || dbRow.priceType || "",
                salePrice: dbRow.price_sell || dbRow.priceSell || dbRow.price || "",
                rentPrice: dbRow.price_rent || dbRow.priceRent || "",
                price: dbRow.price_sell || dbRow.price || dbRow.price_rent || "ไม่ระบุ",
                size: dbRow.area || dbRow.size || "",
                areaNum: dbRow.area_num || dbRow.areaNum || "",
                phone: dbRow.phone || "",
                lineId: dbRow.line_id || dbRow.lineId || "",
                date: dbRow.date || "",
                latitude: dbRow.use_lat || dbRow.latitude || dbRow.use || "",  
                longitude: dbRow.use2_lng || dbRow.longitude || dbRow.use2 || "", 
                url: dbRow.url || "#",
                postId: dbRow.post_id || dbRow.property_id || dbRow.postId || "",
                postDetails: dbRow.details || dbRow.postDetails || "",
                businessType: dbRow.business_type || dbRow.businessType || ""
            };
        });

        const targetLat = parseFloat(criteria.lat || criteria.latitude);
        const targetLng = parseFloat(criteria.lng || criteria.longitude);
        const hasLocationFilter = !isNaN(targetLat) && !isNaN(targetLng);

        // 2. กรองข้อมูลตามเงื่อนไข (เพิ่มความยืดหยุ่น ป้องกันค่าว่างกรองทิ้ง)
        let allFilteredResults = rawResults.filter(item => {
            let match = true;

            // ถ้ามีคำค้นหาแบบพิมพ์ข้อความอิสระ (Search Text)
            if (searchText && searchText.trim() !== "") {
                const fullText = Object.values(item).map(v => v ? String(v).toLowerCase() : '').join(' ');
                const keywords = searchText.trim().toLowerCase().split(/\s+/);
                for (let kw of keywords) {
                    if (!fullText.includes(kw)) {
                        match = false;
                        break;
                    }
                }
            }

            // กรองตาม Dropdown Criteria เฉพาะเมื่อผู้ใช้เลือกค่าส่งมาจริงๆ เท่านั้น
            if (match && criteria && typeof criteria === 'object') {
                const provVal = criteria.province || criteria["จังหวัด"];
                if (provVal && provVal !== "" && provVal !== "ทั้งหมด") {
                    if (!item.province || !item.province.toLowerCase().includes(String(provVal).toLowerCase())) match = false;
                }

                const distVal = criteria.district || criteria["เขต/อำเภอ"];
                if (distVal && distVal !== "" && distVal !== "ทั้งหมด") {
                    if (!item.district || !item.district.toLowerCase().includes(String(distVal).toLowerCase())) match = false;
                }

                const roadVal = criteria.road || criteria["ถนน"];
                if (roadVal && roadVal !== "" && roadVal !== "ทั้งหมด") {
                    if (!item.road || !item.road.toLowerCase().includes(String(roadVal).toLowerCase())) match = false;
                }

                const typeVal = criteria.propertyType || criteria["คอนโด/บ้าน"] || criteria["ประเภทอสังหา"];
                if (typeVal && typeVal !== "" && typeVal !== "ทั้งหมด") {
                    if (!item.propertyType || !item.propertyType.toLowerCase().includes(String(typeVal).toLowerCase())) match = false;
                }

                const projVal = criteria.project || criteria["โครงการ"];
                if (projVal && projVal !== "" && projVal !== "ทั้งหมด") {
                    if (!item.project || !item.project.toLowerCase().includes(String(projVal).toLowerCase())) match = false;
                }

                const priceTypeVal = criteria.priceType || criteria["ขาย/เช่า"] || criteria["แบบราคา"];
                if (priceTypeVal && priceTypeVal !== "" && priceTypeVal !== "ทั้งหมด") {
                    if (!item.priceType || !item.priceType.toLowerCase().includes(String(priceTypeVal).toLowerCase())) match = false;
                }

                // กรองราคาขาย
                const priceSaleMinVal = criteria.priceSaleMin;
                const priceSaleMaxVal = criteria.priceSale || criteria["ราคาขาย"];
                if (priceSaleMinVal) {
                    const minP = parseInt(String(priceSaleMinVal).replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(minP)) {
                        const itemP = parseInt(String(item.salePrice).replace(/[^0-9]/g, ''), 10) || 0;
                        if (itemP < minP) match = false;
                    }
                }
                if (priceSaleMaxVal && priceSaleMaxVal !== "") {
                    const maxP = parseInt(String(priceSaleMaxVal).replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(maxP)) {
                        const itemP = parseInt(String(item.salePrice).replace(/[^0-9]/g, ''), 10) || 0;
                        if (itemP > maxP && itemP > 0) match = false;
                    }
                }

                // กรองพื้นที่ (Area)
                const areaMaxVal = criteria.areaMax;
                const areaMinVal = criteria.areaMin;
                if (areaMinVal || areaMaxVal) {
                    let itemSqWah = parseFloat(String(item.areaNum).replace(/[^0-9.]/g, ''));
                    if (isNaN(itemSqWah)) itemSqWah = parseAreaToSqWah(item.size);
                    if (!isNaN(itemSqWah)) {
                        if (areaMinVal && itemSqWah < parseFloat(areaMinVal)) match = false;
                        if (areaMaxVal && itemSqWah > parseFloat(areaMaxVal)) match = false;
                    }
                }

                // รัศมีพิกัด (Radius Search) - ทำงานเฉพาะเมื่อกดปุ่มค้นหาพิกัด
                if (hasLocationFilter) {
                    const itemLat = parseFloat(item.latitude);
                    const itemLng = parseFloat(item.longitude);
                    if (!isNaN(itemLat) && !isNaN(itemLng)) {
                        const distKm = getDistanceInKm(targetLat, targetLng, itemLat, itemLng);
                        item._distance = distKm;
                        const maxRadiusKm = !isNaN(parseFloat(criteria.radius)) ? parseFloat(criteria.radius) : 1;
                        if (distKm > maxRadiusKm) match = false;
                    } else {
                        match = false; 
                    }
                }
            }
            return match;
        });

        // 3. เรียงลำดับระยะทาง (ถ้ามีพิกัด) หรือเรียงตามปกติ
        if (hasLocationFilter) {
            allFilteredResults.sort((a, b) => (a._distance || 0) - (b._distance || 0));
        }

        const total = allFilteredResults.length;
        const sliced = allFilteredResults.slice(offset, offset + limit);
        const hasMore = (offset + limit) < total;

        res.status(200).json({
            status: 'success',
            results: sliced,
            total: total,
            offset: offset,
            limit: limit,
            hasMore: hasMore,
            nextOffset: offset + sliced.length
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
