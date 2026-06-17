require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

async function sendTelegram(name, phone) {
  const text =
    `🥋 Новая заявка с сайта!\nИмя: ${name}\nТелефон: ${phone}`;

  const res = await fetch(
    `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

app.post('/api/leads', async (req, res) => {
  const { name, phone } = req.body ?? {};

  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }

  if (!TG_TOKEN || !TG_CHAT) {
    console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  try {
    await sendTelegram(name.trim(), phone.trim());
    return res.json({ ok: true });
  } catch (err) {
    console.error('Telegram error:', err.message);
    return res.status(500).json({ error: 'telegram_error' });
  }
});

app.listen(PORT, () => console.log(`Juma Club server on port ${PORT}`));
