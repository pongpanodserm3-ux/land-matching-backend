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

// Git_Server_s17-1  ฟังก์ชันคำนวณระยะทางระหว่างพิกัด 2 จุดด้วยสูตร Haversine Formula (กิโลเมตร)
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

        // [s15-1 SEARCHMODE] โหมดค้นหาแยกขาด - Frontend i15-4 ส่ง searchMode มาด้วย
        // MAP: ตัดด้วยรัศมีอย่างเดียว, ไม่สน Dropdown (Dropdown ถูกทิ้งตั้งแต่ Frontend แล้ว)
        // DROPDOWN: ค้นด้วย Dropdown อย่างเดียว, ห้ามเอารัศมีมาตัด - พิกัด (refLat/refLng) ใช้แค่เรียงใกล้->ไกล
        const searchMode = (rawCriteria.searchMode === 'MAP' || rawCriteria.searchMode === 'DROPDOWN') ? rawCriteria.searchMode : ((rawCriteria.lat !== undefined || rawCriteria.latitude !== undefined) ? 'MAP' : 'DROPDOWN');
        const refLat = parseFloat(rawCriteria.refLat !== undefined ? rawCriteria.refLat : rawCriteria.ref_lat);
        const refLng = parseFloat(rawCriteria.refLng !== undefined ? rawCriteria.refLng : rawCriteria.ref_lng);
        const targetLat = parseFloat(rawCriteria.lat !== undefined ? rawCriteria.lat : rawCriteria.latitude);
        const targetLng = parseFloat(rawCriteria.lng !== undefined ? rawCriteria.lng : rawCriteria.longitude);
        const radiusKm = !isNaN(parseFloat(rawCriteria.radius)) ? parseFloat(rawCriteria.radius) : 1;
        
        // [s15-1] DROPDOWN โหมด: ไม่มี location filter แบบตัดทิ้ง - พิกัดเป็นแค่ตัวเรียง
        const hasLocationFilter = searchMode === 'MAP' && !isNaN(targetLat) && !isNaN(targetLng);
        const hasRefLocation = searchMode === 'DROPDOWN' && !isNaN(refLat) && !isNaN(refLng);
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
        const GEMINI_MODEL = "gemini-3.5-flash-lite"; // MODEL: บังคับใช้ gemini-3.5-flash-lite เสมอ ตามคำสั่งเคร่งครัด

        let queryStr = "";
        let queryParams = [];
        let whereClauses = [];
        let paramIndex = 1;

        if (isMarketplaceSearch) {
            const itemTypeValue = (criteria.itemType || criteria.item_type || criteria.productCategory || "").trim();
            // FIX v7-11-2: ระบบแยกคำ + เดาบริบท + 2ภาษา ครบ 10 หมวด สินค้าทั่วไป
            const categoryKeywords = {
                "เฟอร์นิเจอร์ แต่งบ้าน": ["เฟอร์นิเจอร์","โซฟา","เก้าอี้","โต๊ะ","เตียง","ตู้","แต่งบ้าน","ม่าน"],
                "ของแต่งบ้าน": ["ของแต่งบ้าน","decor","decoration","ม่าน","พรม","แต่งบ้าน","furniture decor","วอลเปเปอร์","wallpaper","แผ่นติดผนัง","กระเบื้องผนัง","ระแนงไม้","ฟิล์มติดกระจก","ม่านกันยุง","ม่านปรับแสง","มู่ลี่","blind"],
                "เก้าอี้และโซฟา": ["เก้าอี้","โซฟา","chair","sofa","couch","เก้าอี้ทำงาน","โซฟาเบด","stool"],
                "โต๊ะและตู้": ["โต๊ะ","ตู้","โต๊ะทำงาน","โต๊ะกินข้าว","ตู้เสื้อผ้า","ตู้โชว์","table","desk","cabinet","wardrobe","cupboard","closet"],
                "เตียงและห้องนอน": ["เตียง","ห้องนอน","เตียงนอน","ที่นอน","bed","bedroom","mattress","bed frame"],
                "อุปกรณ์ภายนอกบ้าน": ["อุปกรณ์ภายนอกบ้าน","เฟอร์นิเจอร์นอกบ้าน","outdoor furniture","garden","patio","นอกบ้าน","สนาม","หญ้าเทียม","หินตกแต่งสวน","น้ำพุ","สายยาง","สปริงเกอร์","ไฟสวน","จอบ","เสียม","ชุดโต๊ะสนาม","ชิงช้า","ร่มสนาม"],
                "โคมไฟ และระบบแสงสว่าง": ["โคมไฟ","หลอดไฟ","ไฟLED","โคมระย้า","แสงสว่าง","lamp","light","lighting","chandelier"],
                "โคมไฟตกแต่ง": ["โคมไฟตกแต่ง","โคมระย้า","โคมไฟเพดาน","chandelier","decorative lamp","lamp"],
                "โคมไฟใช้งาน": ["โคมไฟใช้งาน","โคมไฟตั้งโต๊ะ","โคมไฟอ่านหนังสือ","task lamp","desk lamp"],
                "หลอดไฟและอุปกรณ์": ["หลอดไฟ","หลอดLED","bulb","LED","อุปกรณ์ไฟ"],
                "ประตูหน้าต่าง และวัสดุซ่อมบ้าน": ["ประตู","หน้าต่าง","บานพับ","วงกบ","วัสดุซ่อมบ้าน","ปูน","กระเบื้อง","สีทาบ้าน","door","window"],
                "ประตู": ["ประตู","ประตูไม้","ประตูเหล็ก","door","บานประตู"],
                "หน้าต่าง": ["หน้าต่าง","window","บานหน้าต่าง"],
                "สุขภัณฑ์และห้องน้ำ": ["สุขภัณฑ์","ห้องน้ำ","ชักโครก","อ่างล้างหน้า","toilet","bathroom","sanitary","shower"],
                "วัสดุและเครื่องมือช่าง": ["วัสดุก่อสร้าง","เครื่องมือช่าง","ปูน","กระเบื้อง","สีทาบ้าน","material","tools"],
                "พื้นและวัสดุปูพื้น": ["พื้นไม้","พื้นลามิเนต","พื้นไวนิล","SPC","กระเบื้องปูพื้น","พรมปูพื้น","บัวพื้น","พื้น"],
                "อุปกรณ์ครัว": ["หม้อ","กระทะ","มีด","เขียง","กล่องเก็บอาหาร","อ่างล้างจาน","ที่คว่ำจาน","อุปกรณ์ครัว","kitchen"],
                "คอมพิวเตอร์ และอิเล็กทรอนิกส์": ["คอมพิวเตอร์","โน๊ตบุ๊ค","คอม","อิเล็กทรอนิกส์","เมาส์","คีย์บอร์ด","จอ","การ์ดจอ","computer","laptop","electronics"],
                "คอมพิวเตอร์และโน้ตบุ๊ก": ["คอมพิวเตอร์","โน้ตบุ๊ก","laptop","notebook","PC","computer"],
                "อุปกรณ์เสริมคอมพิวเตอร์": ["อุปกรณ์เสริม","เมาส์","คีย์บอร์ด","จอ","accessory","mouse","keyboard","monitor"],
                "สมาร์ทโฟนและแท็บเล็ต": ["สมาร์ทโฟน","แท็บเล็ต","มือถือ","smartphone","tablet","phone","iPad","iPhone"],
                "เครื่องเสียงและแกดเจ็ต": ["เครื่องเสียง","แกดเจ็ต","ลำโพง","หูฟัง","gadget","speaker","headphone","earphone"],
                "ยานพาหนะ และอะไหล่": ["ยานพาหนะ","รถยนต์","มอเตอร์ไซค์","อะไหล่","ยาง","เครื่องยนต์","รถ","vehicle","car","motorcycle"],
                "รถยนต์": ["รถยนต์","รถเก๋ง","รถSUV","car","automobile","รถมือสอง","รถกระบะ"],
                "รถจักรยานยนต์": ["รถจักรยานยนต์","มอเตอร์ไซค์","motorcycle","มอไซค์","บิ๊กไบค์"],
                "จักรยานและสกู๊ตเตอร์": ["จักรยาน","สกู๊ตเตอร์","bicycle","bike","scooter"],
                "อะไหล่และอุปกรณ์ตกแต่ง": ["อะไหล่","อะไหล่รถ","อุปกรณ์ตกแต่งรถ","spare part","accessory","ยาง","เครื่องยนต์"],
                "เครื่องใช้ในบ้านและห้องครัว": ["เครื่องใช้ไฟฟ้า","ตู้เย็น","แอร์","เครื่องซักผ้า","ทีวี","พัดลม","ไมโครเวฟ","appliance"],
                "เครื่องใช้ไฟฟ้าใหญ่": ["เครื่องใช้ไฟฟ้าใหญ่","ตู้เย็น","แอร์","เครื่องซักผ้า","refrigerator","washing machine","air conditioner"],
                "เครื่องใช้ไฟฟ้าในครัว": ["เครื่องใช้ไฟฟ้าในครัว","ไมโครเวฟ","เตาอบ","เครื่องปั่น","microwave","kitchen appliance"],
                "เครื่องใช้ไฟฟ้าทำความสะอาด": ["เครื่องดูดฝุ่น","เครื่องทำความสะอาด","vacuum","cleaner"],
                "แฟชั่น เครื่องแต่งกาย": ["แฟชั่น","เสื้อผ้า","กางเกง","รองเท้า","กระเป๋า","เครื่องแต่งกาย","เสื้อ","fashion","clothes"],
                "เสื้อผ้า": ["เสื้อผ้า","กางเกง","เสื้อ","fashion","clothes","shirt","pants"],
                "รองเท้าและกระเป๋า": ["รองเท้า","กระเป๋า","shoes","bag","sneakers","handbag"],
                "เครื่องประดับและนาฬิกา": ["เครื่องประดับ","นาฬิกา","jewelry","watch","สร้อย","แหวน"],
                "แม่และเด็ก / สัตว์เลี้ยง": ["แม่และเด็ก","ของเล่นเด็ก","สัตว์เลี้ยง","อาหารหมา","อาหารแมว","เด็ก","baby","kids","pet"],
                "แม่และเด็ก": ["แม่และเด็ก","ของเล่นเด็ก","เด็ก","baby","kids","mom"],
                "สัตว์เลี้ยง": ["สัตว์เลี้ยง","หมา","แมว","อาหารหมา","อาหารแมว","pet","dog","cat"],
                "กีฬา และของสะสม": ["กีฬา","ฟิตเนส","ออกกำลังกาย","ของสะสม","โมเดล","ฟิกเกอร์","จักรยาน","sport","fitness","collectible"],
                "อุปกรณ์กีฬาและฟิตเนส": ["อุปกรณ์กีฬา","ฟิตเนส","ออกกำลังกาย","sport","fitness","gym","dumbbell"],
                "การแคมป์ปิ้ง": ["แคมป์ปิ้ง","เต็นท์","camping","tent","outdoor"],
                "เครื่องดนตรี": ["เครื่องดนตรี","กีต้าร์","เปียโน","musical instrument","guitar","piano"],
                "ของสะสม": ["ของสะสม","โมเดล","ฟิกเกอร์","collectible","figure","model","toy"],
                "สินค้าอุตสาหกรรม และร้านค้า": ["อุตสาหกรรม","โรงงาน","เครื่องจักร","เครื่องมือช่าง","ร้านค้า","อุปกรณ์ร้าน","industrial","factory"],
                "อุปกรณ์ร้านค้า": ["อุปกรณ์ร้าน","ชั้นวาง","เคาน์เตอร์","shop","store","retail","shelf"],
                "เครื่องจักรและเกษตรกรรม": ["เครื่องจักร","เกษตรกรรม","รถไถ","เครื่องมือเกษตร","machinery","agriculture"]
            };
            // FIX v7-11-2: ฟังก์ชันแยกคำไทย (ตัด และ / , / /)
            function splitThaiKeyword(str){
              if(!str) return [];
              return str.split(/[\s,\/]+/).join(' ').split('และ').map(s=>s.trim()).filter(s=>s && s!=='และ' && s.length>=1);
            }
            let baseKeywords = categoryKeywords[itemTypeValue];
            let keywords = [];
            if (baseKeywords) {
              keywords = [...baseKeywords];
            } else {
              // ถ้าไม่มีใน map ตรงๆ -> แยกคำแล้วรวมจาก map ย่อย
              const tokens = splitThaiKeyword(itemTypeValue);
              // ถ้ามี token ส่งมาจาก frontend
              const frontendTokens = criteria.itemTypeTokens || [];
              const allTokens = [...new Set([...tokens, ...frontendTokens, itemTypeValue])];
              allTokens.forEach(tok => {
                if (categoryKeywords[tok]) keywords.push(...categoryKeywords[tok]);
                else keywords.push(tok);
                // เดาบริบท: ถ้า token มีคำย่อยอยู่ใน key ใดๆ
                for (const k in categoryKeywords) {
                  if (k.includes(tok) || tok.includes(k)) {
                    // ไม่ใส่ทั้งหมวดใหญ่เกินไป ป้องกันบาน
                    if (k.length <= 20) keywords.push(...categoryKeywords[k].slice(0,3));
                  }
                }
              });
              // ถ้ายังไม่มีเลย ใช้ค่าเดิมแยกเป็นคำ
              if (keywords.length === 0) keywords = tokens.length>0 ? tokens : [itemTypeValue];
            }
            // รวม searchText ที่ผู้ใช้พิมพ์ + แยกคำด้วย
            if (hasSearchText) {
              const searchTokens = searchText.split(/\s+/).filter(Boolean);
              keywords = keywords.concat(searchTokens);
              // แยกคำไทยใน searchText ด้วย
              searchTokens.forEach(st=> { keywords.push(...splitThaiKeyword(st)); });
            }
            // ลบซ้ำ + ตัดคำสั้นเกินไป
            keywords = [...new Set(keywords.map(k=>k.trim()).filter(k=>k && k.length>=1))];
            console.log('[v7-11-2] itemType:', itemTypeValue, '-> keywords:', keywords.slice(0,20));

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
            // FIX v7-11-3: ไม่กรอง province แบบตัดทิ้ง - กรุงเทพมาก่อน ใกล้เคียงตามมา - ใช้โมเดล gemini-3.5-flash-lite เสมอ
            const selectedProvinceForRank = criteria.province || null;
            const selectedDistrictForRank = criteria.district || null;

            let whereSQL = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
            queryStr = `SELECT * FROM public.marketplace_items ${whereSQL} ORDER BY item_id DESC LIMIT 100;`;
            let result = await pool.query(queryStr, queryParams);
            let rows = result.rows;

            // FIX v7-10-4: De-duplicate keywords + Weighted scoring - แบรนด์เฉพาะเจาะจงได้คะแนนมากกว่า
            const uniqueKeywords = [...new Set(keywords.map(k=> (k||'').toLowerCase().trim()).filter(Boolean))];
            const searchKeywords = hasSearchText ? searchText.split(/\s+/).map(k=>k.toLowerCase().trim()).filter(Boolean) : [];
            const uniqueSearchKeywords = [...new Set(searchKeywords)];
            // แยกคีย์เวิร์ดหมวด (generic) vs คีย์เวิร์ดค้นหา (specific)
            const categoryOnly = uniqueKeywords.filter(k => !uniqueSearchKeywords.includes(k));
            
            rows = rows.map(row => {
                let score = 0;
                const t = (row.title||'').toLowerCase();
                const d = (row.details||'').toLowerCase();
                const s = (row.ai_summary||'').toLowerCase();
                const it = (row.item_type||'').toLowerCase();
                const pt = (row.property_type||'').toLowerCase();
                const haystackAll = `${t} ${it} ${s} ${d} ${pt}`;
                
                // 1. ให้คะแนนคำค้นหาหลัก (จาก edit) - น้ำหนักสูง
                uniqueSearchKeywords.forEach(k => {
                    if (!k || k.length < 2) return;
                    let matched = false;
                    if (t.includes(k)) { score += 15; matched = true; }
                    if (it.includes(k)) { score += 12; matched = true; }
                    if (s.includes(k)) { score += 10; matched = true; }
                    if (d.includes(k)) { score += 8; matched = true; }
                    if (pt.includes(k)) { score += 5; matched = true; }
                    // โบนัสพิเศษ: ถ้าเจอแบรนด์เฉพาะ เช่น นิสสัน, nissan, โตโยต้า, มาสด้า
                    if (matched && ['นิสสัน','nissan','โตโยต้า','toyota','มาสด้า','mazda','ฮอนด้า','honda','ซัมซุง','samsung','ไอโฟน','iphone','ฟอร์ด','ford'].includes(k)) {
                        score += 20;
                    }
                    // โบนัส: ถ้าเจอคำค้นหาทั้งหมดในโพสต์เดียว
                    if (k === 'นิสสัน' || k === 'nissan') {
                        if (t.includes('นิสสัน') || t.includes('nissan') || s.includes('นิสสัน') || s.includes('nissan')) {
                            // นับครั้งที่เจอ
                            const count = (haystackAll.match(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                            score += count * 2;
                        }
                    }
                });
                
                // 2. ให้คะแนนหมวดทั่วไป - น้ำหนักต่ำ (กันรถทุกคันได้คะแนนเท่ากัน)
                categoryOnly.forEach(k => {
                    if (!k || k.length < 2) return;
                    // คำทั่วไปอย่าง "รถ" ให้คะแนนน้อยมาก เพื่อไม่ให้กลบแบรนด์เฉพาะ
                    const isGeneric = ['รถ','ยานพาหนะ','รถยนต์','สินค้า'].includes(k);
                    const weight = isGeneric ? 1 : 2;
                    if (t.includes(k)) score += weight;
                    if (it.includes(k)) score += weight;
                });
                
                return {...row, _score: score};
            });
            // FIX v7-11-3: Rank จังหวัด - กรุงเทพมาก่อน ใกล้เคียงตามมา - ใช้โมเดล gemini-3.5-flash-lite เสมอ
            const provinceNeighbors = {
                "กรุงเทพมหานคร": ["นนทบุรี","ปทุมธานี","สมุทรปราการ","นครปฐม","สมุทรสาคร","กรุงเทพ"],
                "กรุงเทพ": ["นนทบุรี","ปทุมธานี","สมุทรปราการ","นครปฐม","สมุทรสาคร","กรุงเทพมหานคร"],
                "นนทบุรี": ["กรุงเทพ","กรุงเทพมหานคร","ปทุมธานี","พระนครศรีอยุธยา","นครปฐม"],
                "ปทุมธานี": ["กรุงเทพ","กรุงเทพมหานคร","นนทบุรี","พระนครศรีอยุธยา","สระบุรี"],
                "สมุทรปราการ": ["กรุงเทพ","กรุงเทพมหานคร","ฉะเชิงเทรา","สมุทรสาคร","นนทบุรี"],
                "นครปฐม": ["กรุงเทพ","นนทบุรี","สมุทรสาคร","ราชบุรี"],
                "สมุทรสาคร": ["กรุงเทพ","สมุทรปราการ","นครปฐม","สมุทรสงคราม"],
                "พระนครศรีอยุธยา": ["ปทุมธานี","นนทบุรี","สระบุรี","อ่างทอง"],
                "ชลบุรี": ["ฉะเชิงเทรา","ระยอง","สมุทรปราการ"],
                "เชียงใหม่": ["เชียงราย","ลำปาง","ลำพูน","แม่ฮ่องสอน"]
            };
            rows = rows.map(r=>{
                let provinceScore = 0;
                const selProv = typeof selectedProvinceForRank !== 'undefined' ? selectedProvinceForRank : (criteria.province || null);
                const selDist = typeof selectedDistrictForRank !== 'undefined' ? selectedDistrictForRank : (criteria.district || null);
                if (selProv) {
                    const rp = (r.province||'').toString();
                    const rd = (r.district||'').toString();
                    if (rp.includes(selProv) || selProv.includes(rp) || (selProv==='กรุงเทพ' && rp.includes('กรุงเทพมหานคร')) || (selProv==='กรุงเทพมหานคร' && rp.includes('กรุงเทพ'))) {
                        provinceScore += 1000;
                    } else if (provinceNeighbors[selProv] && provinceNeighbors[selProv].some(n=> rp.includes(n))) {
                        provinceScore += 500;
                    } else if (rp) {
                        provinceScore += 10;
                    }
                    if (selDist && rd.includes(selDist)) provinceScore += 200;
                }
                const total = (r._score||0) + provinceScore;
                return {...r, _provinceScore: provinceScore, _totalScore: total};
            });
            rows.sort((a,b) => {
                if ((b._totalScore||0) !== (a._totalScore||0)) return (b._totalScore||0) - (a._totalScore||0);
                if ((b._provinceScore||0) !== (a._provinceScore||0)) return (b._provinceScore||0) - (a._provinceScore||0);
                if ((b._score||0) !== (a._score||0)) return (b._score||0) - (a._score||0);
                return (b.item_id||0) - (a.item_id||0);
            });
            console.log(`RANKING: search="${searchText}" keywords=${JSON.stringify(uniqueSearchKeywords)} -> top scores:`, rows.slice(0,5).map(r=>({title:(r.title||'').slice(0,40), score:r._score})));

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
                // [s15-1] DROPDOWN โหมด: คำนวณระยะจากหมุดอ้างอิงไว้เรียงอย่างเดียว ห้ามตัดทิ้ง ไม่ว่าห่างแค่ไหน / ไม่มีพิกัดก็เก็บไว้ (_distance=null อยู่ท้าย)
                if (hasRefLocation) {
                    const rowLat2 = parseFloat(row.latitude || row.lat || row.use_lat || row.use);
                    const rowLng2 = parseFloat(row.longitude || row.lng || row.use2_lng || row.use2);
                    row._distance = (!isNaN(rowLat2) && !isNaN(rowLng2)) ? getDistanceInKm(refLat, refLng, rowLat2, rowLng2) : null;
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
            if (hasLocationFilter || criteria.province || hasRefLocation) { // [s15-1] DROPDOWN ที่มีหมุดอ้างอิงก็ต้องเรียงตามระยะด้วย
                // FIX v7-11-3: สำหรับอสังหา - จังหวัดที่เลือกมาก่อน แล้วค่อยเรียงตามระยะ - gemini-3.5-flash-lite
                const provNeighbors2 = {
                    "กรุงเทพมหานคร": ["นนทบุรี","ปทุมธานี","สมุทรปราการ"],
                    "กรุงเทพ": ["นนทบุรี","ปทุมธานี","สมุทรปราการ"]
                };
                rows = rows.map(r=>{
                    let ps=0;
                    if(criteria.province){
                        const rp=(r.province||'').toString();
                        if(rp.includes(criteria.province) || (criteria.province==='กรุงเทพ' && rp.includes('กรุงเทพมหานคร'))) ps+=1000;
                        else if(provNeighbors2[criteria.province] && provNeighbors2[criteria.province].some(n=>rp.includes(n))) ps+=500;
                    }
                    return {...r, _provScore: ps};
                });
                rows.sort((a,b)=>{
                    if((b._provScore||0)!==(a._provScore||0)) return (b._provScore||0)-(a._provScore||0);
                    return (a._distance||0)-(b._distance||0);
                });
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
