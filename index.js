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

function calculateTargetCalories(profile) {
    let bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age);

    if (profile.gender === 'L') bmr += 5;
    else bmr -= 161;

    let multiplier = 1.2;
    if (profile.activity === 'sedang') multiplier = 1.55;
    if (profile.activity === 'aktif') multiplier = 1.725;

    let tdee = Math.round(bmr * multiplier);

    if (profile.goal === 'turun') return tdee - 500;
    if (profile.goal === 'naik') return tdee + 300;
    return tdee;
}

async function msgToAIProcess(userName, msgUser, dataUser) {
    const percentage = Math.min(100, Math.round((dataUser.caloriesConsumedToday / dataUser.dailyCalorieTarget) * 100))
    const prompt = `
     Role: Kamu adalah "A2Bot", asisten diet personal.
      User: ${userName}
      Profil: ${dataUser.age}th, ${dataUser.height}cm, ${dataUser.weight}kg.
      Status Harian: ${dataUser.caloriesConsumedToday} / ${dataUser.dailyCalorieTarget} kkal (${percentage}%).
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
      - Saran singkat sesuaikan dengan target user (turun/naik berat).
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
        const result = await model.generateContent([{text: prompt}]);
        const response = result.response;
        let text = response.text();
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(text);
    } catch (error) {
        console.error("Error AI:", error);
        return null;
    }
}

async function handleOnboarding(sock, chatId, user, text) {
    const db = getDB();
    const profile = db.users[user];

    const nextStep = async (key, value, nextStage, question) => {
        profile[key] = value;
        profile.onboardingStep = nextStage;
        saveDB(db);
        await sock.sendMessage(chatId, {text: question});
    };

    const step = profile.onboardingStep;

    if (step === 'ASK_WEIGHT') {
        const weight = parseFloat(text);
        if (isNaN(weight) || weight < 20 || weight > 300) {
            return await sock.sendMessage(chatId, {text: "⚠️ Masukkan berat badan yang valid (angka saja, contoh: 65)."});
        }
        await nextStep('weight', weight, 'ASK_HEIGHT', "Tinggi badanmu berapa? (cm)\n(Contoh: 170)");

    } else if (step === 'ASK_HEIGHT') {
        const height = parseFloat(text);
        if (isNaN(height) || height < 50 || height > 250) {
            return await sock.sendMessage(chatId, {text: "⚠️ Masukkan tinggi badan yang valid (cm)."});
        }
        await nextStep('height', height, 'ASK_AGE', "Berapa umurmu sekarang?");

    } else if (step === 'ASK_AGE') {
        const age = parseInt(text);
        if (isNaN(age) || age < 10 || age > 100) {
            return await sock.sendMessage(chatId, {text: "⚠️ Masukkan umur yang valid."});
        }
        await nextStep('age', age, 'ASK_GENDER', "Apa jenis kelaminmu?\nKetik *L* untuk Laki-laki\nKetik *P* untuk Perempuan");

    } else if (step === 'ASK_GENDER') {
        const gender = text.toUpperCase().trim();
        if (gender !== 'L' && gender !== 'P') {
            return await sock.sendMessage(chatId, {text: "⚠️ Ketik L atau P saja ya."});
        }
        await nextStep('gender', gender, 'ASK_ACTIVITY', "Seberapa aktif kamu?\n1. *Jarang* (Duduk terus/sedikit gerak)\n2. *Sedang* (Olahraga 1-3x seminggu)\n3. *Aktif* (Olahraga intens/kerja fisik)\n\n(Ketik: Jarang / Sedang / Aktif)");

    } else if (step === 'ASK_ACTIVITY') {
        const activity = text.toLowerCase();
        if (!['jarang', 'sedang', 'aktif'].includes(activity)) {
            return await sock.sendMessage(chatId, {text: "⚠️ Pilih salah satu: Jarang, Sedang, atau Aktif."});
        }
        await nextStep('activity', activity, 'ASK_GOAL', "Terakhir, apa targetmu?\n1. *Turun* Berat Badan\n2. *Jaga* Berat Badan\n3. *Naik* Berat Badan\n\n(Ketik: Turun / Jaga / Naik)");

    } else if (step === 'ASK_GOAL') {
        const goal = text.toLowerCase();
        if (!['turun', 'jaga', 'naik'].includes(goal)) {
            return await sock.sendMessage(chatId, {text: "⚠️ Pilih: Turun, Jaga, atau Naik."});
        }

        profile.goal = goal;
        profile.onboardingStep = 'DONE';

        const personalTarget = calculateTargetCalories(profile);
        profile.dailyCalorieTarget = personalTarget;

        saveDB(db);

        const summary = `🎉 *Profil Siap!*\n\nData kamu:\n- BB/TB: ${profile.weight}kg / ${profile.height}cm\n- Umur: ${profile.age}th\n- Target: ${goal.toUpperCase()}\n\n🎯 *Kebutuhan Kalori Harianmu:*\n👉 *${personalTarget} kkal*\n\nSekarang kamu bisa mulai lapor makanan! Ketik saja "Makan nasi goreng".`;
        await sock.sendMessage(chatId, {text: summary});
    }
}


async function connectToWhatsApp() {
    const authFolder = path.join(__dirname, 'auth_info_baileys');
    const {state, saveCreds} = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        defaultQueryTimeoutMs: undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const {connection, lastDisconnect, qr} = update;
        if (qr) qrcode.generate(qr, {small: true});

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
            else {
                try {
                    fs.rmSync(authFolder, {recursive: true, force: true});
                    connectToWhatsApp();
                } catch (e) {
                }
            }
        } else if (connection === 'open') {
            console.log('✅ A2Bot Terhubung (Mode Personalisasi)');
        }
    });

    sock.ev.on('messages.upsert', async ({messages}) => {
        const msg = messages ? messages[0] : null;
        if (!msg || !msg.message || msg.key.fromMe) return;

        const senderId = msg.key.participant || msg.key.remoteJid;
        const pushName = msg.pushName || "Teman";
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage) return;

        console.log(`📩 ${pushName}: ${textMessage}`);
        const db = getDB();

        if (!db.users[senderId]) {
            db.users[senderId] = {
                name: pushName,
                onboardingStep: 'ASK_WEIGHT',
                caloriesConsumedToday: 0,
                lastActive: new Date().toISOString()
            };
            saveDB(db);
            await sock.sendMessage(msg.key.remoteJid, {text: `Halo *${pushName}*! 👋 Selamat datang di A2Bot.\n\nSebelum mulai, yuk atur profil dietmu dulu biar akurat.\n\nPertama, berapa *berat badanmu* saat ini? (kg)`});
            return;
        }

        const user = db.users[senderId];

        if (user.onboardingStep && user.onboardingStep !== 'DONE') {
            await handleOnboarding(sock, msg.key.remoteJid, senderId, textMessage);
            return;
        }

        await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
        const aiResponse = await msgToAIProcess(pushName, textMessage, user);

        if (aiResponse) {
            if (aiResponse.calories_detected > 0) {
                user.caloriesConsumedToday += aiResponse.calories_detected;
                user.lastActive = new Date().toISOString();
                db.users[senderId] = user;
                saveDB(db);
            }
            await sock.sendMessage(msg.key.remoteJid, {text: aiResponse.response_message});
        }
    });
}

connectToWhatsApp();
