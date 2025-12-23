const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

const API_KEY = "";
const TARGET_GROUP_NAME = "[TEST] A2Calorie: Penghitung Kalori";
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash"});

const DB_FILE = '/database.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }));
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
            { text: prompt},
            { text: `Input User: ${msgUser}`}
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
