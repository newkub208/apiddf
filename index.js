// index.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// --- Firebase Admin SDK Initialization ---
try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (serviceAccountString && databaseURL) {
        // For production environments like Render, load from environment variables
        const serviceAccount = JSON.parse(serviceAccountString);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: databaseURL
        });
        console.log('✅ เชื่อมต่อ Firebase จาก Environment Variables สำเร็จ');
    } else {
        // For local development, load from a local file
        const serviceAccountFile = require('./serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountFile),
            databaseURL: "https://apikf-bbe63-default-rtdb.europe-west1.firebasedatabase.app"
        });
        console.log('✅ เชื่อมต่อ Firebase จากไฟล์ serviceAccountKey.json สำเร็จ (Local Mode)');
    }
} catch (error) {
    console.error('❌ ไม่สามารถเริ่มต้น Firebase Admin SDK ได้!');
    console.error('ตรวจสอบว่าได้ตั้งค่า Environment Variables (FIREBASE_SERVICE_ACCOUNT, FIREBASE_DATABASE_URL) บน Render หรือมีไฟล์ serviceAccountKey.json ในเครื่องแล้ว');
    process.exit(1);
}

const db = admin.database();
const configRef = db.ref('config'); // Reference to 'config' node in Firebase

// --- Global Variables ---
let PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || '';
let VERIFY_TOKEN = process.env.VERIFY_TOKEN || '';
let knowledgeBase = {};
const appLogs = [];
const MAX_LOGS = 200;


// --- Console Log Capture Setup ---
const originalConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };
function captureLog(level, args) {
    const message = args.map(arg => typeof arg === 'object' && arg !== null ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
    const logEntry = { timestamp: new Date(), level: level.toUpperCase(), message };
    appLogs.unshift(logEntry);
    if (appLogs.length > MAX_LOGS) appLogs.pop();
}
console.log = (...args) => { originalConsole.log.apply(console, args); captureLog('log', args); };
console.error = (...args) => { originalConsole.error.apply(console, args); captureLog('error', args); };
console.warn = (...args) => { originalConsole.warn.apply(console, args); captureLog('warn', args); };
console.info = (...args) => { originalConsole.info.apply(console, args); captureLog('info', args); };

// --- SVG Icons ---
const icons = {
    edit: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 4-4 4 4"/></svg>`,
    save: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-save"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders-horizontal"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>`,
    brain: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-brain-circuit"><path d="M12 5a3 3 0 1 0-5.993.129M12 5a3 3 0 1 1 5.993.129M15 13a3 3 0 1 0-5.993.129M15 13a3 3 0 1 1 5.993.129M9 13a3 3 0 1 0-5.993.129M9 13a3 3 0 1 1 5.993.129M12 21a3 3 0 1 0-5.993.129M12 21a3 3 0 1 1 5.993.129M20 16a2 2 0 0 0-2-2h-1"/><path d="M4 14a2 2 0 0 0-2 2v1"/><path d="M12 13h-1"/><path d="M12 9V8"/><path d="M12 5V4"/><path d="M15 9h1"/><path d="M9 9H8"/><path d="m14 16.5-.5.5"/><path d="m10 16.5.5.5"/><path d="m14 7.5-.5.5"/><path d="m10 7.5.5.5"/></svg>`,
    database: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-database"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>`,
    menu: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
    x: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    fileText: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Loads knowledge base from Firebase on startup. Tokens are loaded from environment variables.
 */
async function loadDataFromFirebase() {
    try {
        const snapshot = await configRef.child('knowledgeBase').once('value');
        const data = snapshot.val();
        if (data) {
            knowledgeBase = data;
            console.log('✅ โหลดคลังความรู้ (Knowledge Base) จาก Firebase สำเร็จ');
        } else {
            console.info('ℹ️ ไม่พบคลังความรู้ใน Firebase, เริ่มต้นด้วยข้อมูลว่าง');
        }
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการโหลดคลังความรู้จาก Firebase:', error);
    }
}

// Initial data load from Firebase
loadDataFromFirebase();

/**
 * Renders the HTML page with dynamic content.
 */
function renderPage(res, activePage, pageContent) {
    const navLinkClasses = 'px-3 py-2 rounded-md text-sm font-medium transition-colors';
    const activeClass = 'bg-gray-900 text-white';
    const inactiveClass = 'text-gray-300 hover:bg-gray-700 hover:text-white';
    const dashboardLink = `<a href="/" class="${navLinkClasses} ${activePage === 'dashboard' ? activeClass : inactiveClass}">แดชบอร์ด</a>`;
    const logsLink = `<a href="/logs" class="${navLinkClasses} ${activePage === 'logs' ? activeClass : inactiveClass}">Logs</a>`;

    res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Bot - ${activePage.charAt(0).toUpperCase() + activePage.slice(1)}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600&display=swap" rel="stylesheet">
        <style> body { font-family: 'Kanit', sans-serif; } ::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #1f2937; } ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 4px; } </style>
    </head>
    <body class="bg-gray-900 text-gray-200">
        <nav class="bg-gray-800/80 backdrop-blur-sm sticky top-0 z-50 shadow-lg">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8"><div class="flex items-center justify-between h-16"><div class="flex items-center"><span class="font-semibold text-xl text-white flex items-center gap-2">${icons.brain} AI Bot</span></div><div class="hidden md:block"><div class="ml-10 flex items-baseline space-x-4">${dashboardLink}${logsLink}</div></div><div class="-mr-2 flex md:hidden"><button type="button" id="hamburger-btn" class="bg-gray-800 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"><span class="sr-only">เปิดเมนู</span><div id="hamburger-open">${icons.menu}</div><div id="hamburger-close" class="hidden">${icons.x}</div></button></div></div></div>
            <div id="mobile-menu" class="md:hidden hidden"><div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">${dashboardLink.replace('class="', 'class="block ')}${logsLink.replace('class="', 'class="block ')}</div></div>
        </nav>
        <main><div class="container mx-auto p-4 md:p-8 max-w-4xl">${pageContent}</div></main>
        <script>
            const btn = document.getElementById('hamburger-btn'), menu = document.getElementById('mobile-menu'), openIcon = document.getElementById('hamburger-open'), closeIcon = document.getElementById('hamburger-close');
            btn.addEventListener('click', () => { const isHidden = menu.classList.contains('hidden'); menu.classList.toggle('hidden', !isHidden); openIcon.classList.toggle('hidden', !isHidden); closeIcon.classList.toggle('hidden', isHidden); });
            function clearForm() { if(document.getElementById('teach-form')) { document.getElementById('teach-form').reset(); document.getElementById('knowledgeId').value = ''; document.getElementById('form-submit-btn').innerHTML = \`${icons.save}<span>บันทึกข้อมูล</span>\`; } }
            function editKnowledge(knowledge) { if(document.getElementById('knowledgeId')) { document.getElementById('knowledgeId').value = knowledge.id; document.getElementById('knowledgeText').value = knowledge.text || ''; document.getElementById('form-submit-btn').innerHTML = \`${icons.save}<span>อัปเดตข้อมูล</span>\`; document.getElementById('teach-form-card').scrollIntoView({ behavior: 'smooth' }); } }
        </script>
    </body>
    </html>`);
}

// --- Route for Dashboard ---
app.get('/', (req, res) => {
    const knowledgeListHtml = Object.keys(knowledgeBase).length > 0
    ? Object.entries(knowledgeBase).map(([id, text]) => `
        <div class="bg-gray-700/50 p-4 rounded-xl border border-gray-600 shadow-md">
          <p class="text-gray-200 break-words whitespace-pre-wrap">${text}</p>
          <div class="flex justify-end items-center mt-3 gap-2 border-t border-gray-600/50 pt-3">
              <p class="text-xs text-gray-500 mr-auto">ID: ${id}</p>
              <button onclick='editKnowledge(${JSON.stringify({id, text})})' class="p-2 text-gray-400 hover:text-amber-400 transition-colors">${icons.edit}</button>
              <form method="POST" action="/delete-knowledge" onsubmit="return confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลนี้?');"><input type="hidden" name="knowledgeId" value="${id}"><button type="submit" class="p-2 text-gray-400 hover:text-red-500 transition-colors">${icons.delete}</button></form>
          </div>
        </div>`).join('')
    : `<div class="text-center text-gray-500 py-20"><p class="text-4xl opacity-50">${icons.database}</p><p class="mt-4 text-lg">คลังความรู้ยังว่างเปล่า</p><p class="text-sm">ใช้ฟอร์มด้านบนเพื่อเริ่มสอน AI</p></div>`;

    const pageContent = `
        <div class="space-y-8">
            <div id="teach-form-card" class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                <h2 id="form-title" class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-teal-400 flex items-center gap-3">${icons.brain}<span>สอน AI ด้วย Prompt</span></h2>
                <form id="teach-form" method="POST" action="/save-knowledge" class="space-y-4">
                    <input type="hidden" name="knowledgeId" id="knowledgeId">
                    <div><label for="knowledgeText" class="block mb-2 text-sm font-medium text-gray-300">ป้อนข้อมูลที่ต้องการให้ AI เรียนรู้</label><textarea id="knowledgeText" name="knowledgeText" rows="6" placeholder="เช่น\nโปรโมชั่นเดือนนี้: ซื้อ 1 แถม 1\nhttps://example.com/image.png" class="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block w-full p-2.5 whitespace-pre-wrap" required></textarea></div>
                    <div class="flex gap-4 pt-2"><button id="form-submit-btn" type="submit" class="w-full flex justify-center items-center gap-2 text-white bg-teal-600 hover:bg-teal-700 focus:ring-4 focus:outline-none focus:ring-teal-800 font-medium rounded-lg text-sm px-5 py-3 text-center transition-all duration-300">${icons.save}<span>บันทึกข้อมูล</span></button><button type="button" onclick="clearForm()" class="w-full text-gray-300 bg-gray-600 hover:bg-gray-500 font-medium rounded-lg text-sm px-5 py-3 text-center transition-colors">ยกเลิก</button></div>
                </form>
            </div>
            <div class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                <h2 class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-amber-400 flex items-center gap-3">${icons.database}<span>คลังความรู้ของ AI</span></h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">${knowledgeListHtml}</div>
            </div>
            <div class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                <h2 class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-cyan-400 flex items-center gap-3">${icons.settings}<span>ตั้งค่าการเชื่อมต่อ (โหลดจาก Server)</span></h2>
                <div class="space-y-4">
                    <div><label class="block mb-1 text-sm font-medium text-gray-400">Page Access Token</label><input type="text" value="********" class="bg-gray-700 border border-gray-600 text-gray-400 text-sm rounded-lg block w-full p-2.5" disabled></div>
                    <div><label class="block mb-1 text-sm font-medium text-gray-400">Verify Token</label><input type="text" value="********" class="bg-gray-700 border border-gray-600 text-gray-400 text-sm rounded-lg block w-full p-2.5" disabled></div>
                    <p class="text-xs text-gray-500 text-center pt-2">การตั้งค่า Token ถูกจัดการผ่าน Environment Variables บน Server เพื่อความปลอดภัย</p>
                </div>
            </div>
        </div>`;
    renderPage(res, 'dashboard', pageContent);
});

// --- Route for Logs Page ---
app.get('/logs', (req, res) => {
    const logColors = { LOG: 'text-gray-400', INFO: 'text-blue-400', WARN: 'text-yellow-400', ERROR: 'text-red-400' };
    const logsHtml = appLogs.length > 0 ? appLogs.map(log => `
        <div class="font-mono text-sm p-2 border-b border-gray-700/50 flex flex-wrap gap-x-4">
            <span class="text-gray-500">${log.timestamp.toLocaleTimeString('th-TH', { hour12: false })}</span>
            <span class="font-bold w-12 ${logColors[log.level] || 'text-gray-400'}">[${log.level}]</span>
            <p class="text-gray-300 flex-1 whitespace-pre-wrap break-all">${log.message}</p>
        </div>`).join('') : `<div class="text-center text-gray-500 py-20"><p class="text-4xl opacity-50">${icons.fileText}</p><p class="mt-4 text-lg">ยังไม่มี Log การทำงาน</p></div>`;
    renderPage(res, 'logs', `<div class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700"><h2 class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-purple-400 flex items-center gap-3">${icons.fileText}<span>Application Logs</span></h2><div class="max-h-[70vh] overflow-y-auto pr-2">${logsHtml}</div></div>`);
});

// --- API Endpoints to Manage Knowledge Base ---
app.post('/save-knowledge', async (req, res) => {
    const { knowledgeId, knowledgeText } = req.body;
    if (knowledgeText.trim()) {
        const id = knowledgeId || 'kn_' + Date.now();
        const textToSave = knowledgeText.trim();
        try {
            await configRef.child('knowledgeBase').child(id).set(textToSave);
            knowledgeBase[id] = textToSave; // Update local cache
            console.info(`🧠 อัปเดตคลังความรู้ ID: ${id} ใน Firebase`);
        } catch (error) {
            console.error(`❌ เกิดข้อผิดพลาดในการบันทึก Knowledge ID: ${id} ไปยัง Firebase:`, error);
        }
    }
    res.redirect('/');
});

app.post('/delete-knowledge', async (req, res) => {
    const { knowledgeId } = req.body;
    if (knowledgeId && knowledgeBase[knowledgeId]) {
        try {
            await configRef.child('knowledgeBase').child(knowledgeId).remove();
            delete knowledgeBase[knowledgeId]; // Update local cache
            console.warn(`🗑️ ลบคลังความรู้ ID: ${knowledgeId} จาก Firebase`);
        } catch (error) {
            console.error(`❌ เกิดข้อผิดพลาดในการลบ Knowledge ID: ${knowledgeId} จาก Firebase:`, error);
        }
    }
    res.redirect('/');
});


// --- Facebook Webhook Verification ---
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    console.info(`[WEBHOOK GET] ได้รับคำขอยืนยัน Token: ${token}`);
    if (mode === 'subscribe' && token === VERIFY_TOKEN && VERIFY_TOKEN !== '') {
        console.log('✅ Webhook ได้รับการยืนยัน!');
        res.status(200).send(challenge);
    } else {
        console.error('❌ การยืนยัน Webhook ล้มเหลว! Token ไม่ตรงกันหรือยังไม่ได้ตั้งค่าบน Server');
        res.sendStatus(403);
    }
});

// --- Facebook Webhook Event Handler ---
app.post('/webhook', (req, res) => {
  res.status(200).send('EVENT_RECEIVED'); // Acknowledge event immediately
  const body = req.body;
  if (body.object === 'page') {
    body.entry.forEach(async (entry) => {
      const webhook_event = entry.messaging[0];
      if (webhook_event?.sender?.id && webhook_event?.message?.text) {
        const sender_psid = webhook_event.sender.id;
        const userMessage = webhook_event.message.text.trim();
        console.log(`💬 ข้อความจาก ${sender_psid}: "${userMessage}"`);

        // 1. Search in primary knowledge base (loaded from Firebase)
        let fullReply = findAnswerInKnowledgeBase(userMessage);

        // 2. If not found, call fallback AI/API (Optional, can be re-enabled if needed)
        if (!fullReply) {
            console.info("🤔 ไม่พบในคลังความรู้หลัก");
            // fullReply = await getFallbackResponse(userMessage); // Example for a fallback
        } else {
            console.info("✅ พบข้อมูลในคลังความรู้หลัก!");
        }
        
        // 3. Send reply if an answer was found
        if (fullReply) {
            const replyParts = fullReply.split('\n').map(part => part.trim()).filter(part => part);
            console.info(`- กำลังแบ่งข้อความตอบกลับเป็น ${replyParts.length} ส่วน`);
            for (const part of replyParts) {
                await sendMessage(sender_psid, part);
                await delay(500); // Delay between messages
            }
        } else {
             console.warn(`[WEBHOOK] ไม่พบคำตอบสำหรับ: "${userMessage}"`);
        }
      }
    });
  }
});

/**
 * Searches the local knowledgeBase (loaded from Firebase) for an answer.
 */
function findAnswerInKnowledgeBase(message) {
    const lowerCaseMessage = message.toLowerCase().trim();
    if (!lowerCaseMessage) return null;
    
    // Check for a keyword match from the knowledge base keys
    for (const [id, text] of Object.entries(knowledgeBase)) {
        if (lowerCaseMessage.includes(id.toLowerCase())) {
            console.info(`⭐ พบ Match! (ID: ${id})`);
            return text;
        }
    }
    return null;
}

/**
 * Sends a message back to the user via the Facebook Graph API.
 */
async function sendMessage(psid, messageContent) {
  if (!messageContent) {
    console.warn("ℹ️ ไม่มีข้อความที่จะส่ง, ยกเลิกการตอบกลับ");
    return;
  }
  if (!PAGE_ACCESS_TOKEN) {
    console.error('❌ ยังไม่ได้ตั้งค่า PAGE_ACCESS_TOKEN บน Server');
    return;
  }

  const isImageUrl = /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif))$/i.test(messageContent.trim());
  let request_body;

  if (isImageUrl) {
      console.info(`🖼️ กำลังส่งข้อความประเภทรูปภาพ: ${messageContent}`);
      request_body = { recipient: { id: psid }, message: { attachment: { type: "image", payload: { url: messageContent.trim(), is_reusable: true } } } };
  } else {
      console.info(`📝 กำลังส่งข้อความประเภทข้อความ: ${messageContent.substring(0,50)}...`);
      request_body = { recipient: { id: psid }, message: { text: messageContent } };
  }
  
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
    console.log(`✅ ส่งข้อความตอบกลับไปยัง ${psid} สำเร็จ!`);
  } catch (err) {
    console.error("❌ ไม่สามารถส่งข้อความได้:", err.response?.data?.error || err.message);
  }
}

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 เซิร์ฟเวอร์บอทพร้อมใช้งานที่ port ${PORT}`);
});
