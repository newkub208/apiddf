const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

const appLogs = [];
const MAX_LOGS = 200;

const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
};

function captureLog(level, args) {
    const message = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try {
                return JSON.stringify(arg, null, 2);
            } catch (e) {
                return '[Unserializable Object]';
            }
        }
        return String(arg);
    }).join(' ');

    const logEntry = {
        timestamp: new Date(),
        level: level.toUpperCase(),
        message: message
    };

    appLogs.unshift(logEntry);
    if (appLogs.length > MAX_LOGS) {
        appLogs.pop();
    }
}

console.log = (...args) => { originalConsole.log.apply(console, args); captureLog('log', args); };
console.error = (...args) => { originalConsole.error.apply(console, args); captureLog('error', args); };
console.warn = (...args) => { originalConsole.warn.apply(console, args); captureLog('warn', args); };
console.info = (...args) => { originalConsole.info.apply(console, args); captureLog('info', args); };

const DB_FILE = './db.json';
let PAGE_ACCESS_TOKEN = '';
let VERIFY_TOKEN = '';
let knowledgeBase = {};

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

function saveData() {
    try {
        const dataToSave = { PAGE_ACCESS_TOKEN, VERIFY_TOKEN, knowledgeBase };
        fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
        console.log('💾 ข้อมูลถูกบันทึกลงใน db.json แล้ว');
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล:', error);
    }
}

function loadData() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            const parsedData = JSON.parse(data);
            PAGE_ACCESS_TOKEN = parsedData.PAGE_ACCESS_TOKEN || '';
            VERIFY_TOKEN = parsedData.VERIFY_TOKEN || '';
            knowledgeBase = parsedData.knowledgeBase || {};
            console.log('✅ โหลดข้อมูลจาก db.json สำเร็จ');
        } else {
            console.info('ℹ️ ไม่พบไฟล์ db.json, เริ่มต้นด้วยข้อมูลว่าง');
        }
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการโหลดข้อมูล:', error);
    }
}

loadData();

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
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between h-16">
                    <div class="flex items-center">
                        <span class="font-semibold text-xl text-white flex items-center gap-2">${icons.brain} AI Bot</span>
                    </div>
                    <div class="hidden md:block">
                        <div class="ml-10 flex items-baseline space-x-4">
                            ${dashboardLink}
                            ${logsLink}
                        </div>
                    </div>
                    <div class="-mr-2 flex md:hidden">
                        <button type="button" id="hamburger-btn" class="bg-gray-800 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white">
                            <span class="sr-only">เปิดเมนู</span>
                            <div id="hamburger-open">${icons.menu}</div>
                            <div id="hamburger-close" class="hidden">${icons.x}</div>
                        </button>
                    </div>
                </div>
            </div>
            <div id="mobile-menu" class="md:hidden hidden">
                <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                   ${dashboardLink.replace('class="', 'class="block ')}
                   ${logsLink.replace('class="', 'class="block ')}
                </div>
            </div>
        </nav>

        <main>
            <div class="container mx-auto p-4 md:p-8 max-w-4xl">
                ${pageContent}
            </div>
        </main>
        
        <script>
            const btn = document.getElementById('hamburger-btn');
            const menu = document.getElementById('mobile-menu');
            const openIcon = document.getElementById('hamburger-open');
            const closeIcon = document.getElementById('hamburger-close');

            btn.addEventListener('click', () => {
                const isHidden = menu.classList.contains('hidden');
                menu.classList.toggle('hidden', !isHidden);
                openIcon.classList.toggle('hidden', !isHidden);
                closeIcon.classList.toggle('hidden', isHidden);
            });
            function clearForm() {
                if(document.getElementById('teach-form')) {
                    document.getElementById('teach-form').reset();
                    document.getElementById('knowledgeId').value = '';
                    document.getElementById('form-submit-btn').innerHTML = \`${icons.save}<span>บันทึกข้อมูล</span>\`;
                }
            }
            function editKnowledge(knowledge) {
                if(document.getElementById('knowledgeId')) {
                    document.getElementById('knowledgeId').value = knowledge.id;
                    document.getElementById('knowledgeText').value = knowledge.text || '';
                    document.getElementById('form-submit-btn').innerHTML = \`${icons.save}<span>อัปเดตข้อมูล</span>\`;
                    document.getElementById('teach-form-card').scrollIntoView({ behavior: 'smooth' });
                }
            }
        </script>
    </body>
    </html>
    `);
}

app.get('/', (req, res) => {
    const knowledgeListHtml = Object.keys(knowledgeBase).length > 0
    ? Object.entries(knowledgeBase).map(([id, text]) => `
        <div class="bg-gray-700/50 p-4 rounded-xl border border-gray-600 shadow-md">
          <p class="text-gray-200 break-words whitespace-pre-wrap">${text}</p>
          <div class="flex justify-end items-center mt-3 gap-2 border-t border-gray-600/50 pt-3">
              <p class="text-xs text-gray-500 mr-auto">ID: ${id}</p>
              <button onclick='editKnowledge(${JSON.stringify({id, text})})' class="p-2 text-gray-400 hover:text-amber-400 transition-colors">${icons.edit}</button>
              <form method="POST" action="/delete-knowledge" onsubmit="return confirm('คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลนี้?');">
                  <input type="hidden" name="knowledgeId" value="${id}">
                  <button type="submit" class="p-2 text-gray-400 hover:text-red-500 transition-colors">${icons.delete}</button>
              </form>
          </div>
        </div>`).join('')
    : `<div class="text-center text-gray-500 py-20"><p class="text-4xl opacity-50">${icons.database}</p><p class="mt-4 text-lg">คลังความรู้ยังว่างเปล่า</p><p class="text-sm">ใช้ฟอร์มด้านบนเพื่อเริ่มสอน AI</p></div>`;

    const pageContent = `
        <div class="space-y-8">
            <div id="teach-form-card" class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                <h2 id="form-title" class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-teal-400 flex items-center gap-3">${icons.brain}<span>สอน AI ด้วย Prompt</span></h2>
                <form id="teach-form" method="POST" action="/save-knowledge" class="space-y-4">
                    <input type="hidden" name="knowledgeId" id="knowledgeId">
                    <div>
                        <label for="knowledgeText" class="block mb-2 text-sm font-medium text-gray-300">ป้อนข้อมูลที่ต้องการให้ AI เรียนรู้ (จะถูกใช้ตอบก่อนเรียก AI)</label>
                        <textarea id="knowledgeText" name="knowledgeText" rows="6" placeholder="เช่น&#10;โปรโมชั่นเดือนนี้: ซื้อ 1 แถม 1&#10;วิธีจัดส่ง: ส่งด้วย Kerry Express เท่านั้น&#10;https://example.com/image.png" class="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block w-full p-2.5 whitespace-pre-wrap" required></textarea>
                    </div>
                    <div class="flex gap-4 pt-2">
                        <button id="form-submit-btn" type="submit" class="w-full flex justify-center items-center gap-2 text-white bg-teal-600 hover:bg-teal-700 focus:ring-4 focus:outline-none focus:ring-teal-800 font-medium rounded-lg text-sm px-5 py-3 text-center transition-all duration-300">${icons.save}<span>บันทึกข้อมูล</span></button>
                        <button type="button" onclick="clearForm()" class="w-full text-gray-300 bg-gray-600 hover:bg-gray-500 font-medium rounded-lg text-sm px-5 py-3 text-center transition-colors">ยกเลิก</button>
                    </div>
                </form>
            </div>
            <div class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                <h2 class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-amber-400 flex items-center gap-3">${icons.database}<span>คลังความรู้ของ AI</span></h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">${knowledgeListHtml}</div>
            </div>
            <div class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                <h2 class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-cyan-400 flex items-center gap-3">${icons.settings}<span>ตั้งค่าการเชื่อมต่อ</span></h2>
                <form method="POST" action="/save-settings" class="space-y-4">
                     <div>
                        <label for="page_token" class="block mb-1 text-sm font-medium text-gray-300">Page Access Token</label>
                        <input type="password" id="page_token" name="page_token" placeholder="วาง Page Access Token ที่นี่" value="${PAGE_ACCESS_TOKEN}" class="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5" required>
                    </div>
                     <div>
                        <label for="verify_token" class="block mb-1 text-sm font-medium text-gray-300">Verify Token</label>
                        <input type="text" id="verify_token" name="verify_token" placeholder="สร้างและกรอก Verify Token ของคุณ" value="${VERIFY_TOKEN}" class="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block w-full p-2.5" required>
                    </div>
                    <button type="submit" class="w-full flex justify-center items-center gap-2 text-white bg-cyan-600 hover:bg-cyan-700 focus:ring-4 focus:outline-none focus:ring-cyan-800 font-medium rounded-lg text-sm px-5 py-3 text-center transition-all duration-300">${icons.save}<span>บันทึกการตั้งค่า</span></button>
                </form>
            </div>
        </div>`;
    renderPage(res, 'dashboard', pageContent);
});

app.get('/logs', (req, res) => {
    const logColors = {
        LOG: 'text-gray-400',
        INFO: 'text-blue-400',
        WARN: 'text-yellow-400',
        ERROR: 'text-red-400'
    };
    const logsHtml = appLogs.length > 0 ? appLogs.map(log => `
        <div class="font-mono text-sm p-2 border-b border-gray-700/50 flex flex-wrap gap-x-4">
            <span class="text-gray-500">${log.timestamp.toLocaleTimeString('th-TH', { hour12: false })}</span>
            <span class="font-bold w-12 ${logColors[log.level] || 'text-gray-400'}">[${log.level}]</span>
            <p class="text-gray-300 flex-1 whitespace-pre-wrap break-all">${log.message}</p>
        </div>
    `).join('') : `<div class="text-center text-gray-500 py-20"><p class="text-4xl opacity-50">${icons.fileText}</p><p class="mt-4 text-lg">ยังไม่มี Log การทำงาน</p></div>`;

    const pageContent = `
         <div class="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
            <h2 class="text-2xl font-semibold mb-4 border-b border-gray-700 pb-3 text-purple-400 flex items-center gap-3">${icons.fileText}<span>Application Logs</span></h2>
            <div class="max-h-[70vh] overflow-y-auto pr-2">
                ${logsHtml}
            </div>
        </div>`;
    renderPage(res, 'logs', pageContent);
});

app.post('/save-knowledge', (req, res) => {
    const { knowledgeId, knowledgeText } = req.body;
    if (knowledgeText.trim()) {
        const id = knowledgeId || 'kn_' + Date.now();
        knowledgeBase[id] = knowledgeText.trim();
        console.info(`🧠 อัปเดตคลังความรู้ ID: ${id}`);
    }
    saveData();
    res.redirect('/');
});

app.post('/delete-knowledge', (req, res) => {
    const { knowledgeId } = req.body;
    if (knowledgeId && knowledgeBase[knowledgeId]) {
        delete knowledgeBase[knowledgeId];
        console.warn(`🗑️ ลบคลังความรู้ ID: ${knowledgeId}`);
    }
    saveData();
    res.redirect('/');
});

app.post('/save-settings', (req, res) => {
  PAGE_ACCESS_TOKEN = req.body.page_token.trim();
  VERIFY_TOKEN = req.body.verify_token.trim();
  console.info('⚙️ บันทึกการตั้งค่า Token');
  saveData();
  res.redirect('/');
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    console.info(`[WEBHOOK GET] ได้รับคำขอยืนยัน Token: ${token}`);
    if (mode === 'subscribe' && token === VERIFY_TOKEN && VERIFY_TOKEN !== '') {
        console.log('✅ Webhook ได้รับการยืนยัน!');
        res.status(200).send(challenge);
    } else {
        console.error('❌ การยืนยัน Webhook ล้มเหลว! Token ไม่ตรงกันหรือยังไม่ได้ตั้งค่า');
        res.sendStatus(403);
    }
});

app.post('/webhook', (req, res) => {
  console.log('--- [WEBHOOK POST RECEIVED] ---');
  console.log('BODY:', JSON.stringify(req.body, null, 2));

  const body = req.body;
  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');
    body.entry.forEach(async (entry) => {
      const webhook_event = entry.messaging[0];
      if (webhook_event && webhook_event.sender && webhook_event.message) {
        if(webhook_event.message.text) {
            const sender_psid = webhook_event.sender.id;
            const userMessage = webhook_event.message.text.trim();
            console.log(`💬 ข้อความจาก ${sender_psid}: "${userMessage}"`);
            
            let fullReply = findAnswerInKnowledgeBase(userMessage);

            if (!fullReply) {
                console.info("🤔 ไม่พบในคลังความรู้, กำลังส่งต่อไปยัง AI...");
                fullReply = await getAiResponse(userMessage, sender_psid);
            } else {
                console.info("✅ พบข้อมูลในคลังความรู้!");
            }
            
            if (fullReply) {
                const replyParts = fullReply.split('\n').map(part => part.trim()).filter(part => part);
                console.info(`- กำลังแบ่งข้อความตอบกลับเป็น ${replyParts.length} ส่วน`);
                for (const part of replyParts) {
                    await sendMessage(sender_psid, part);
                    await delay(500);
                }
            } else {
                 console.warn(`[WEBHOOK] ไม่พบคำตอบสำหรับ: "${userMessage}"`);
            }

        } else {
            console.warn(`[WEBHOOK] ได้รับ event message แต่ไม่ใช่ข้อความ (อาจเป็นไฟล์แนบ):`, webhook_event.message);
        }
      } else {
          console.warn(`[WEBHOOK] ได้รับ event แต่ข้อมูลไม่สมบูรณ์:`, webhook_event);
      }
    });
  } else {
    res.sendStatus(404);
  }
});

function findAnswerInKnowledgeBase(message) {
    const lowerCaseMessage = message.toLowerCase().trim();
    console.info(`🔍 กำลังค้นหา: "${lowerCaseMessage}" ในคลังความรู้...`);

    if (!lowerCaseMessage) {
        return null;
    }

    for (const [id, text] of Object.entries(knowledgeBase)) {
        const lowerCaseKnowledge = text.toLowerCase();
        if (lowerCaseKnowledge.includes(lowerCaseMessage)) {
            console.info(`⭐ พบ Match! (ID: ${id})`);
            return text;
        }
    }
    
    return null;
}

async function getAiResponse(message, userId) {
    const apiKey = 'e62d60dd-8853-4233-bbcb-9466b4cbc265';
    
    const knowledgeContext = Object.values(knowledgeBase).join('\n\n');
    
    let finalPrompt;
    if (knowledgeContext) {
        finalPrompt = `จากข้อมูลต่อไปนี้:\n---\n${knowledgeContext}\n---\n\nกรุณาใช้ข้อมูลด้านบนเพื่อตอบคำถามต่อไปนี้: "${message}"`;
    } else {
        finalPrompt = message;
    }
    
    console.info(`📝 สร้าง Prompt สำหรับ AI: "${finalPrompt.substring(0, 100)}..."`);

    const apiUrl = `https://kaiz-apis.gleeze.com/api/gemini-vision?q=${encodeURIComponent(finalPrompt)}&uid=${userId}&apikey=${apiKey}`;
    
    try {
        console.info(`🚀 กำลังส่งคำขอไปที่ AI API สำหรับผู้ใช้ ${userId}`);
        const response = await axios.get(apiUrl, { timeout: 15000 });
        const aiText = response.data?.response;
        if (aiText) {
            console.info(`🤖 AI ตอบกลับ: "${aiText.substring(0, 50)}..."`);
            return aiText;
        } else {
            console.error('❌ AI API ตอบกลับมาในรูปแบบที่ไม่คาดคิด:', response.data);
            return "ขออภัยค่ะ, AI ไม่สามารถประมวลผลคำขอได้ในขณะนี้";
        }
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาดในการเรียก AI API:', error.message);
        return "ขออภัยค่ะ, เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI";
    }
}

async function sendMessage(psid, messageContent) {
  if (!messageContent) {
    console.warn("ℹ️ ไม่มีข้อความที่จะส่ง, ยกเลิกการตอบกลับ");
    return;
  }
  if (!PAGE_ACCESS_TOKEN) {
    console.error('❌ ยังไม่ได้ตั้งค่า PAGE_ACCESS_TOKEN');
    return;
  }

  let request_body;
  const isImageUrl = /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif))$/i.test(messageContent.trim());

  if (isImageUrl) {
      console.info(`🖼️ กำลังส่งข้อความประเภทรูปภาพ: ${messageContent}`);
      request_body = {
          recipient: { id: psid },
          message: {
              attachment: {
                  type: "image",
                  payload: {
                      url: messageContent.trim(),
                      is_reusable: true
                  }
              }
          }
      };
  } else {
      console.info(`📝 กำลังส่งข้อความประเภทข้อความ: ${messageContent.substring(0,50)}...`);
      request_body = {
          recipient: { id: psid },
          message: { text: messageContent }
      };
  }
  
  try {
    await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, request_body);
    console.log('✅ ส่งข้อความตอบกลับสำเร็จ!');
  } catch (err) {
    console.error("❌ ไม่สามารถส่งข้อความได้:", err.response?.data?.error || err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ เซิร์ฟเวอร์บอทพร้อมใช้งานที่ http://localhost:${PORT}`);
});
