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

// Git_Server_1-3 ฟังก์ชันคำนวณระยะทางระหว่างพิกัด 2 จุดด้วยสูตร Haversine Formula (กิโลเมตร)
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

//  Git_Server_1-2 FIXED V14: รองรับ 5 คอลัมน์ + Scoring สำหรับ marketplace_items 10 หมวด + ใช้ gemini-3.5-flash-lite เสมอ
app.post('/api/properties', async (req, res) => {
    try {
        const offset = parseInt(req.body.offset || 0, 10);
        const limit = parseInt(req.body.limit || 10, 10);
        const rawCriteria = req.body.criteria || {};
        const searchText = (req.body.searchText || "").trim();

        const targetLat = parseFloat(rawCriteria.lat !== undefined ? rawCriteria.lat : rawCriteria.latitude);
        const targetLng = parseFloat(rawCriteria.lng !== undefined ? rawCriteria.lng : rawCriteria.longitude);
        const radiusKm = !isNaN(parseFloat(rawCriteria.radius)) ? parseFloat(rawCriteria.radius) : 1;
        
        const hasLocationFilter = !isNaN(targetLat) && !isNaN(targetLng);
        const hasComplexFilter = rawCriteria.priceSale || rawCriteria.priceRent || rawCriteria.areaMax;
        const needsMemoryPagination = hasLocationFilter || hasComplexFilter;

        const defaultLabels = [
            "พิกัด", "ขาย/เช่า", "คอนโด/บ้าน", "ราคาขาย", "ราคาเช่า", "ทั้งหมด", 
            "เลือกจังหวัด", "เลือกอำเภอ", "เลือกถนน", "เลือกโครงการ", "จังหวัด", 
            "เขต/อำเภอ", "ถนน", "โครงการ", "ซอย", "เนื้อที่", "ขนาด", "ปรับขนาด", 
            "อื่นๆ", "สถานที่ใกล้เคียง", "สาธารณูปโภคพิเศษ"
        ];

        const criteria = {};
        for (const [key, val] of Object.entries(rawCriteria)) {
            if (["lat", "lng", "latitude", "longitude", "radius"].includes(key)) continue;
            if (val && typeof val === 'string' && !defaultLabels.includes(val.trim())) {
                criteria[key] = val.trim();
            }
            if (key === 'itemType' || key === 'item_type' || key === 'productCategory') {
                if (val && typeof val === 'string' && val.trim().length > 0) criteria[key] = val.trim();
            }
        }
        if (rawCriteria.table) criteria.table = rawCriteria.table;
        if (rawCriteria.itemType) criteria.itemType = rawCriteria.itemType;

        const hasCriteria = Object.keys(criteria).length > 0;
        const hasSearchText = searchText !== "";

        const isMarketplaceSearch = !!(criteria.itemType || criteria.item_type || criteria.productCategory || (criteria.table && String(criteria.table).includes('marketplace')));

        // MODEL: บังคับใช้ gemini-3.5-flash-lite เสมอ ตามคำสั่ง
        const GEMINI_MODEL = "gemini-3.5-flash-lite";

        let queryStr = "";
        let queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        if (isMarketplaceSearch) {
            const itemTypeValue = (criteria.itemType || criteria.item_type || criteria.productCategory || "").trim();
            const categoryKeywords = {
                "เฟอร์นิเจอร์ แต่งบ้าน": ["เฟอร์นิเจอร์","โซฟา","เก้าอี้","โต๊ะ","เตียง","ตู้","แต่งบ้าน","ม่าน"],
                "โคมไฟ และระบบแสงสว่าง": ["โคมไฟ","หลอดไฟ","ไฟLED","โคมระย้า","แสงสว่าง"],
                "ประตูหน้าต่าง และวัสดุซ่อมบ้าน": ["ประตู","หน้าต่าง","บานพับ","วงกบ","วัสดุซ่อมบ้าน","ปูน","กระเบื้อง","สีทาบ้าน"],
                "คอมพิวเตอร์ และอิเล็กทรอนิกส์": ["คอมพิวเตอร์","โน๊ตบุ๊ค","คอม","อิเล็กทรอนิกส์","เมาส์","คีย์บอร์ด","จอ","การ์ดจอ"],
                "ยานพาหนะ และอะไหล่": ["ยานพาหนะ","รถยนต์","มอเตอร์ไซค์","อะไหล่","ยาง","เครื่องยนต์","รถ"],
                "เครื่องใช้ไฟฟ้าภายในบ้าน": ["เครื่องใช้ไฟฟ้า","ตู้เย็น","แอร์","เครื่องซักผ้า","ทีวี","พัดลม","ไมโครเวฟ"],
                "แฟชั่น เครื่องแต่งกาย": ["แฟชั่น","เสื้อผ้า","กางเกง","รองเท้า","กระเป๋า","เครื่องแต่งกาย","เสื้อ"],
                "แม่และเด็ก / สัตว์เลี้ยง": ["แม่และเด็ก","ของเล่นเด็ก","สัตว์เลี้ยง","อาหารหมา","อาหารแมว","เด็ก"],
                "กีฬา และของสะสม": ["กีฬา","ฟิตเนส","ออกกำลังกาย","ของสะสม","โมเดล","ฟิกเกอร์","จักรยาน"],
                "สินค้าอุตสาหกรรม และร้านค้า": ["อุตสาหกรรม","โรงงาน","เครื่องจักร","เครื่องมือช่าง","ร้านค้า","อุปกรณ์ร้าน"]
            };
            let keywords = categoryKeywords[itemTypeValue] || [itemTypeValue];
            if (hasSearchText) keywords = keywords.concat(searchText.split(/\s+/).filter(Boolean));

            let orClauses = [];
            keywords.forEach(kw => {
                if (!kw) return;
                const like = `%${kw}%`;
                orClauses.push(`(title ILIKE $${paramIndex} OR details ILIKE $${paramIndex} OR ai_summary ILIKE $${paramIndex} OR item_type ILIKE $${paramIndex} OR property_type ILIKE $${paramIndex})`);
                queryParams.push(like);
                paramIndex++;
            });
            if (orClauses.length > 0) {
                whereClauses.push(`(${orClauses.join(" OR ")})`);
            }
            if (criteria.province) { whereClauses.push(`province ILIKE $${paramIndex}`); queryParams.push(`%${criteria.province}%`); paramIndex++; }
            if (criteria.district) { whereClauses.push(`district ILIKE $${paramIndex}`); queryParams.push(`%${criteria.district}%`); paramIndex++; }

            let whereSQL = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
            queryStr = `SELECT * FROM public.marketplace_items ${whereSQL} ORDER BY item_id DESC LIMIT 100;`;
            let result = await pool.query(queryStr, queryParams);
            let rows = result.rows;

            rows = rows.map(row => {
                let score = 0;
                const t = (row.title||'').toLowerCase();
                const d = (row.details||'').toLowerCase();
                const s = (row.ai_summary||'').toLowerCase();
                const it = (row.item_type||'').toLowerCase();
                const pt = (row.property_type||'').toLowerCase();
                keywords.forEach(kw => {
                    const k = (kw||'').toLowerCase();
                    if (!k) return;
                    if (t.includes(k)) score += 5;
                    if (it.includes(k)) score += 4;
                    if (s.includes(k)) score += 3;
                    if (d.includes(k)) score += 2;
                    if (pt.includes(k)) score += 1;
                });
                return {...row, _score: score};
            });
            rows.sort((a,b) => (b._score||0) - (a._score||0));

            let paged = rows.slice(offset, offset+limit);

            const mappedResults = paged.map(row => ({
                ...row,
                latitude: row.latitude || row.lat || row.use_lat || row.use || "",
                longitude: row.longitude || row.lng || row.use2_lng || row.use2 || "",
                images: Array.isArray(row.images) ? row.images : [],
                _score: row._score
            }));

            return res.status(200).json({
                status: 'success',
                results: mappedResults,
                nextOffset: offset + mappedResults.length,
                hasMore: (offset + mappedResults.length) < rows.length,
                model: GEMINI_MODEL
            });
        }

        if (hasSearchText) {
            const kws = searchText.split(/\s+/);
            kws.forEach(kw => {
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
        if (criteria.soi) { whereClauses.push(`details ILIKE $${paramIndex}`); queryParams.push(`%${criteria.soi}%`); paramIndex++; }
        if (criteria.other) { whereClauses.push(`details ILIKE $${paramIndex}`); queryParams.push(`%${criteria.other}%`); paramIndex++; }
        if (criteria.nearby) { whereClauses.push(`details ILIKE $${paramIndex}`); queryParams.push(`%${criteria.nearby}%`); paramIndex++; }
        if (criteria.facility) { whereClauses.push(`details ILIKE $${paramIndex}`); queryParams.push(`%${criteria.facility}%`); paramIndex++; }

        let whereSQL = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

        if (!hasCriteria && !hasSearchText && !needsMemoryPagination) {
            const latestDateResult = await pool.query(`SELECT MAX(date) as max_date FROM public.properties WHERE date IS NOT NULL`);
            const maxDate = latestDateResult.rows[0]?.max_date;
            if (maxDate) {
                queryStr = `SELECT * FROM public.properties WHERE date = $1 ORDER BY property_id ASC LIMIT $2 OFFSET $3;`;
                queryParams = [maxDate, limit, offset];
            } else {
                queryStr = `SELECT * FROM public.properties ORDER BY property_id ASC LIMIT $1 OFFSET $2;`;
                queryParams = [limit, offset];
            }
        } else if (needsMemoryPagination) {
            queryStr = `SELECT * FROM public.properties ${whereSQL} ORDER BY property_id ASC;`;
        } else {
            queryStr = `SELECT * FROM public.properties ${whereSQL} ORDER BY property_id ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1};`;
            queryParams.push(limit, offset);
        }

        let result = await pool.query(queryStr, queryParams);
        let rows = result.rows;

        if (needsMemoryPagination) {
            rows = rows.filter(row => {
                let keep = true;
                if (hasLocationFilter) {
                    const rowLat = parseFloat(row.latitude || row.lat || row.use_lat || row.use);
                    const rowLng = parseFloat(row.longitude || row.lng || row.use2_lng || row.use2);
                    if (!isNaN(rowLat) && !isNaN(rowLng)) {
                        const dist = getDistanceInKm(targetLat, targetLng, rowLat, rowLng);
                        row._distance = dist;
                        if (dist > radiusKm) keep = false;
                    } else if (hasLocationFilter) {
                        keep = false;
                    }
                }
                if (keep && criteria.priceSale) {
                    const rawStr = String(row.price_sell || row.price || "");
                    const numOnly = parseFloat(rawStr.replace(/[^0-9.]/g, ''));
                    let actualPrice = isNaN(numOnly) ? 0 : numOnly;
                    if (criteria.priceSale === "ไม่เกิน 2 ล้าน" && actualPrice > 2000000) keep = false;
                    else if (criteria.priceSale === "ไม่เกิน 5 ล้าน" && actualPrice > 5000000) keep = false;
                    else if (criteria.priceSale === "ไม่เกิน 10 ล้าน" && actualPrice > 10000000) keep = false;
                    else if (criteria.priceSale === "ไม่เกิน 20 ล้าน" && actualPrice > 20000000) keep = false;
                    else if (criteria.priceSale === "ตั้งแต่ 20 ล้านเป็นต้นไป" && actualPrice < 20000000) keep = false;
                }
                if (keep && criteria.priceRent) {
                    const rawStr = String(row.price_rent || "");
                    const numOnly = parseFloat(rawStr.replace(/[^0-9.]/g, ''));
                    let actualPrice = isNaN(numOnly) ? 0 : numOnly;
                    if (criteria.priceRent === "ไม่เกิน 5,000" && actualPrice > 5000) keep = false;
                    else if (criteria.priceRent === "ไม่เกิน 10,000" && actualPrice > 10000) keep = false;
                    else if (criteria.priceRent === "ไม่เกิน 15,000" && actualPrice > 15000) keep = false;
                    else if (criteria.priceRent === "ไม่เกิน 20,000" && actualPrice > 20000) keep = false;
                    else if (criteria.priceRent === "ตั้งแต่ 20,000 เป็นต้นไป" && actualPrice < 20000) keep = false;
                }
                if (keep && criteria.areaMax) {
                    const sizeStr = String(row.area || row.details || "");
                    let totalSqWah = 0;
                    const raiMatch = sizeStr.match(/([0-9.]+)\s*ไร่/);
                    const nganMatch = sizeStr.match(/([0-9.]+)\s*งาน/);
                    const wahMatch = sizeStr.match(/([0-9.]+)\s*(?:ตร\.?วา|ตารางวา)/);
                    if (raiMatch) totalSqWah += parseFloat(raiMatch[1]) * 400;
                    if (nganMatch) totalSqWah += parseFloat(nganMatch[1]) * 100;
                    if (wahMatch) totalSqWah += parseFloat(wahMatch[1]);
                    if (totalSqWah === 0) {
                        const numOnly = parseFloat(sizeStr.replace(/[^0-9.]/g, ''));
                        totalSqWah = isNaN(numOnly) ? 0 : numOnly;
                    }
                    if (criteria.areaMax === "ไม่เกิน 100 ตารางวา" && totalSqWah > 100) keep = false;
                    else if (criteria.areaMax === "ไม่เกิน 400 ตารางวา" && totalSqWah > 400) keep = false;
                    else if (criteria.areaMax === "ไม่เกิน 10 ไร่" && totalSqWah > 4000) keep = false;
                    else if (criteria.areaMax === "มากกว่า 10 ไร่ เป็นต้นไป" && totalSqWah <= 4000) keep = false;
                }
                return keep;
            });
            if (hasLocationFilter) {
                rows.sort((a, b) => (a._distance || 0) - (b._distance || 0));
            }
            rows = rows.slice(offset, offset + limit);
        }

        const mappedResults = rows.map(row => ({
            ...row,
            latitude: row.latitude || row.lat || row.use_lat || row.use || "",
            longitude: row.longitude || row.lng || row.use2_lng || row.use2 || "",
            images: Array.isArray(row.images) ? row.images : [] 
        }));

        res.status(200).json({
            status: 'success',
            results: mappedResults,
            nextOffset: offset + mappedResults.length,
            hasMore: mappedResults.length === limit,
            model: GEMINI_MODEL
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
