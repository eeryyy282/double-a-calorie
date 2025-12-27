require('dotenv').config();
const {makeWASocket, useMultiFileAuthState, DisconnectReason, delay, Browsers} = require('@whiskeysockets/baileys');
const {GoogleGenerativeAI} = require('@google/generative-ai');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    console.error("❌ Error: API_KEY tidak ditemukan. Pastikan file .env sudah diisi.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({model: "gemini-2.5-flash"});

const DB_FILE = path.join(__dirname, 'database.json');

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({users: {}}));
}

function getDB() {
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function msgToAIProcess(userName, msgUser, dataUser) {
    const percentage = Math.min(100, Math.round((dataUser.caloriesConsumedToday / dataUser.dailyCalorieTarget) * 100))
    const prompt = `
      Role: Kamu adalah "A2Bot", asisten diet yang asik, suportif, dan sangat rapi di WhatsApp.
      User: ${userName}
      Data Saat Ini: Terisi ${dataUser.caloriesConsumedToday} dari target ${dataUser.dailyCalorieTarget} kkal (${percentage}%).
      Input User: "${msgUser}"
      
      Tugas:
      1. Analisa makanan.
      2. Estimasi kalori (agresif tapi adil).
      3. Buat respon yang STRUKTUR-nya RAPI, SINGKAT, dan ENAK DIBACA.
      
      Aturan Format Respon (WA Style):
      - Gunakan enter (\\n) untuk memisahkan setiap bagian. JANGAN menulis dalam satu paragraf panjang.
      - Gunakan BOLD (*) untuk nama makanan dan angka kalori.
      - Gunakan bullet points (-) jika ada lebih dari satu makanan.
      - Sertakan Progress Bar Visual sederhana menggunakan emoji kotak (misal: 🟩🟩⬜⬜).
      - Akhiri dengan satu kalimat motivasi pendek/lucu/tips kesehatan.
      
      Contoh Style Output yang Diharapkan (dalam string JSON):
      "🍽️ *Nasi Goreng* (~300 kkal)\n\n📊 *Status Harian:*\n1500 / 2000 kkal\n🟩🟩🟩🟩⬜ 75%\n\n💡 _Jangan lupa minum air ya!_"

      Output Wajib JSON:
      {
        "calories_detected": number (integer, 0 jika tidak ada makanan),
        "response_message": string (teks balasan yang sudah diformat rapi dengan enter/newline)
      }
    `;

    try {
        const result = await model.generateContent([
            {text: prompt},
            {text: `Input User: ${msgUser}`}
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
    const authFolder = path.join(__dirname, 'auth_info_baileys');

    const {state, saveCreds} = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const {connection, lastDisconnect, qr} = update;
        if (qr) {
            console.log("\nScan QR Code di bawah ini:");
            qrcode.generate(qr, {small: true});
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus: ', lastDisconnect.error?.message);

            if (shouldReconnect) {
                console.log('Mencoba menghubungkan ulang...');
                connectToWhatsApp();
            } else {
                console.log('⚠️ Sesi rusak atau logout. Menghapus sesi lama...');

                try {
                    fs.rmSync(authFolder, {recursive: true, force: true});
                    console.log('✅ Folder sesi berhasil dihapus.');
                    console.log('🔄 Memulai ulang bot untuk Scan QR baru...');

                    connectToWhatsApp();
                } catch (error) {
                    console.error('❌ Gagal menghapus folder sesi:', error);
                    console.log('Silakan hapus folder "auth_info_baileys" secara manual.');
                }
            }
        } else if (connection === 'open') {
            console.log('✅ A2Bot terhubung (Mode Aman Aktif)!');
        }
    });

    sock.ev.on('messages.upsert', async ({messages}) => {
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
            await sock.sendMessage(msg.key.remoteJid, {text: `Halo ${pushName}! Profil baru dibuat.`});
            return;
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

connectToWhatsApp();
