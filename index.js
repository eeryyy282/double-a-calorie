const {makeWASocket, useMultiFileAuthState, DisconnectReason} = require('@whiskeysockets/baileys')
const {GoogleGenerativeAI} = require('@google/generative-ai')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

const API_KEY = "";
const TARGET_GROUP_NAME = "[TEST] A2Calorie: Penghitung Kalori";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({model: "gemini-2.5-flash"});

const DB_FILE = '/database.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({users: {}}));
}

function getDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function msgToAIProcess(username, msgUser, dataUser) {
    const prompt = 'Anda adalah asisten nutrisi pribadi bernama "A2Bot" (Double A Bot).\n' +
        '      User: ${namaUser}\n' +
        '      Status Saat Ini: Konsumsi ${dataUser.caloriesConsumedToday} / Target ${dataUser.dailyCalorieTarget} kkal.\n' +
        '      \n' +
        '      Tugas:\n' +
        '      1. Analisa input makanan user dari teks chat.\n' +
        '      2. Estimasi kalori secara agresif tapi adil.\n' +
        '      3. Jawab HANYA dengan format JSON.\n' +
        '      \n' +
        '      Output JSON Format:\n' +
        '      {\n' +
        '        "calories_detected": number (0 jika bukan makanan),\n' +
        '        "response_message": string (Respon chat bahasa Indonesia santai, sebutkan sisa kalori. Gunakan emoji. Mengaku sebagai A2Bot jika perlu.)\n' +
        '      }';

    try {
        const result = await model.generateContent([
            {text: prompt},
            {text: `Input User: ${msgUser}`}
        ]);
        const response = result.response;
        let text = response.text();

        text = text.replace(/```json/g, '').replace(/```/g, '').trim()
        return JSON.parse(text);
    } catch (error) {
        console.error("Error AI:", error);
        return null;
    }
}

async function connectToWhatsApp() {
    const {state, saveCreds} = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const {connection, lastDisconnect, qr} = update;

        if (qr) {
            console.log("Scan QR Code di bawah ini dengan WhatsApp:");
            qrcode.generate(qr, {small: true});
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba reconnect...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ A2Bot berhasil terhubung dan siap bekerja!');
        }
    });

    sock.ev.on('messages.upsert', async ({message}) => {
        const msg = message[0];

        if (!msg.message || msg.key.fromMe) return;

        const senderId = msg.key.participant || msg.key.remoteJid;
        const pushName = msg.pushName || "Teman";

        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage) return;

        console.log('📩 Pesan dari ${pushName}: ${textMessage}')

        const db = getDB();

        if (!db.users[senderId]) {
            db.users[senderId] = {
                name: pushName,
                dailyCalorieTarget: 2000,
                caloriesConsumedToday: 0,
                lastActive: new Date().toISOString()
            };
            saveDB(db);

            await sock.sendMessage(msg.key.remoteJid, {text: `Halo ${pushName}! 👋 A2Bot aktif. Target kalorimu set di 2000 kkal. Silakan input makanan!`})
            return
        }

        const userProfile = db.users[senderId];

        await sock.sendPresenceUpdate('composing', msg.key.remoteJid);

        const aiResponse = await msgToAIProcess(pushName, textMessage, userProfile);

        if (aiResponse) {
            if (aiResponse.calories_detected > 0) {
                userProfile.caloriesConsumedToday += aiResponse.calories_detected;
                userProfile.lastActive = new Date().toISOString();
                db.users[senderId] = userProfile;
                saveDB(db);
            }

            await sock.sendMessage(msg.key.remoteJid, {text: aiResponse.response_message});
        }
    });
}