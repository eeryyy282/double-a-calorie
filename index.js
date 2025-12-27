require('dotenv').config();
const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay, Browsers } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error("❌ Error: API_KEY tidak ditemukan. Pastikan file .env sudah diisi.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const DB_FILE = path.join(__dirname, 'database.json');

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }));
}

function getDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function msgToAIProcess(namaUser, msgUser, dataUser) {
    const prompt = `
      Anda adalah asisten nutrisi pribadi bernama "A2Bot" (Double A Bot).
      User: ${namaUser}
      Status Saat Ini: Konsumsi ${dataUser.caloriesConsumedToday} / Target ${dataUser.dailyCalorieTarget} kkal.
      Tugas: Analisa input makanan user, estimasi kalori, dan jawab santai dalam Bahasa Indonesia.
      Jawab HANYA format JSON:
      {
        "calories_detected": number,
        "response_message": string
      }
    `;

    try {
        const result = await model.generateContent([
            { text: prompt },
            { text: `Input User: ${msgUser}` }
        ]);
        const response = result.response;
        let text = response.text();
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (error) {
        console.error("Error AI:", error);
        return null;
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ A2Bot terhubung (Mode Aman Aktif)!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages ? messages[0] : null;
        if (!msg || !msg.message || msg.key.fromMe) return;

        const senderId = msg.key.participant || msg.key.remoteJid;
        const pushName = msg.pushName || "Teman";
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage) return;

        console.log(`📩 Pesan dari ${pushName}: ${textMessage}`);

        await sock.readMessages([msg.key]);

        const db = getDB();

        if (!db.users[senderId]) {
            db.users[senderId] = {
                name: pushName,
                dailyCalorieTarget: 2000,
                caloriesConsumedToday: 0,
                lastActive: new Date().toISOString()
            };
            saveDB(db);
            await sock.sendMessage(msg.key.remoteJid, { text: `Halo ${pushName}! Profil baru dibuat.` });
            return;
        }

        const userProfile = db.users[senderId];

        const thinkingTime = Math.floor(Math.random() * 3000) + 2000;

        await sock.sendPresenceUpdate('composing', msg.key.remoteJid);

        await delay(thinkingTime);

        const aiResponse = await msgToAIProcess(pushName, textMessage, userProfile);

        await sock.sendPresenceUpdate('paused', msg.key.remoteJid);

        if (aiResponse) {
            if (aiResponse.calories_detected > 0) {
                userProfile.caloriesConsumedToday += aiResponse.calories_detected;
                userProfile.lastActive = new Date().toISOString();
                db.users[senderId] = userProfile;
                saveDB(db);
            }

            await sock.sendMessage(msg.key.remoteJid, { text: aiResponse.response_message });
        }
    });
}

connectToWhatsApp();
