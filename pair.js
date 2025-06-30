import express from 'express';
import fs from 'fs';
import pino from 'pino';
import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

function removeFile(FilePath) {
  try {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
  } catch (e) {
    console.error('Error removing file:', e);
  }
}

function generateRandomId(length = 6, numberLength = 4) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${result}${number}`;
}

router.get('/', async (req, res) => {
  let num = req.query.number;
  let dirs = './' + (num || `session`);

  async function initiateSession() {
    const { state, saveCreds } = await useMultiFileAuthState(dirs);

    try {
      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        browser: Browsers.macOS('Safari'),
      });

      if (!sock.authState.creds.registered) {
        num = num.replace(/[^0-9]/g, '');
        const code = await sock.requestPairingCode(num);
        if (!res.headersSent) {
          console.log({ num, code });
          await res.send({ code });
        }
      }

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          // ✅ Auto follow channel
          try {
            await sock.newsletterFollow("120363409414874042@newsletter");
            console.log("✅ LUXALGO CHANNEL FOLLOWED");
          } catch (e) {
            console.log("❌ Newsletter Follow Error:", e.message);
          }

          // 📤 Upload session to mega
          const megaUrl = await upload(fs.createReadStream(`${dirs}/creds.json`), `${generateRandomId()}.json`);
          const sessionText = 'id=' + megaUrl.replace('https://mega.nz/file/', '');

          const userJid = jidNormalizedUser(num + '@s.whatsapp.net');
          await sock.sendMessage(userJid, { text: sessionText });
          await sock.sendMessage(userJid, { text: "*DONT SEND YOUR ID🧬*" });

          // 🖼️ Notify admin with image
          try {
            await sock.sendMessage("94773416478@s.whatsapp.net", {
              image: { url: "https://files.catbox.moe/joo2gt.jpg" },
              caption: `*LUXALGO MINI BOT Connected  successfull✅*\n\n> *𝚃𝙷𝙸𝚂 𝚆𝙷𝙰𝚃𝚂𝙰𝙿𝙿 𝙱𝙾𝚃 𝚆𝙰𝚂 𝙲𝚁𝙴𝙰𝚃𝙴𝙳 𝙱𝚈 𝙼𝙴.🧚‍♂️*\n\n> *𝙸𝚃 𝙸𝚂 𝙰 𝚂𝙸𝙼𝙿𝙻𝙴 𝙰𝙽𝙳 𝚄𝚂𝙴𝚁-𝙵𝚁𝙸𝙴𝙽𝙳𝙻𝚈 𝙱𝙾𝚃.*🍃\n> *𝚂𝙾𝙼𝙴 𝙱𝚄𝙶𝚂 𝙼𝙰𝚈 𝙴𝚇𝙸𝚂𝚃 𝙰𝚂 𝙾𝙵 𝙽𝙾𝚆, 𝙰𝙽𝙳 𝚃𝙷𝙴𝚈 𝚆𝙸𝙻𝙻 𝙱𝙴 𝙵𝙸𝚇𝙴𝙳 𝙸𝙽 𝙵𝚄𝚃𝚄𝚁𝙴 𝚄𝙿𝙳𝙰𝚃𝙴𝚂.*⛓‍💥⚒️\n\n> *𝙸𝙵 𝚈𝙾𝚄 𝙷𝙰𝚅𝙴 𝙰𝙽𝚈 𝙸𝚂𝚂𝚄𝙴𝚂, 𝙿𝙻𝙴𝙰𝚂𝙴 𝙲𝙾𝙽𝚃𝙰𝙲𝚃 𝚃𝙷𝙴 𝙳𝙴𝚅𝙴𝙻𝙾𝙿𝙴𝚁.🎉*\n\n*Created by: Pathum Malsara*`
            });
            console.log("📤 Admin notified with bot connect image.");
          } catch (e) {
            console.log("❌ Failed to notify admin:", e.message);
          }

          // ❤️ Seen & React to Status
          sock.ev.on("messages.upsert", async ({ messages }) => {
            for (const msg of messages) {
              if (
                msg.key.remoteJid === "status@broadcast" &&
                !msg.key.fromMe &&
                msg.message
              ) {
                try {
                  await sock.readMessages([msg.key]);
                  await sock.sendMessage(msg.key.remoteJid, {
                    react: { text: "❤️", key: msg.key }
                  });
                  console.log(`❤️ Seen + Reacted to ${msg.key.participant}`);
                } catch (err) {
                  console.log("❌ Status React Error:", err.message);
                }
              }
            }
          });
        }

        if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
          console.log("⚠️ Disconnected. Retrying...");
          setTimeout(() => initiateSession(), 5000);
        }
      });

    } catch (err) {
      console.error('❌ Error:', err);
      if (!res.headersSent) {
        res.status(503).send({ code: 'Service Unavailable' });
      }
    }
  }

  await initiateSession();
});

process.on('uncaughtException', (err) => {
  console.log('Caught exception: ' + err);
});

export default router;
