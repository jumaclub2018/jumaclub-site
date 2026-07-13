require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

// ── Общая база (сохраняем заявки с источником) ───────────────────────────────
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;
async function saveLead(name, phone, source) {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO leads (name, phone, hall, status, created_date, source) VALUES ($1,$2,'','new',CURRENT_DATE,$3)",
      [String(name).slice(0, 120), String(phone).slice(0, 40), String(source || 'сайт').slice(0, 60)]
    );
  } catch (e) { console.error('saveLead:', e.message); }
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Telegram ────────────────────────────────────────────────────────────────
async function tgSend(text) {
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

// ── Заявка с формы ────────────────────────────────────────────────────────────
app.post('/api/leads', async (req, res) => {
  const { name, phone, source } = req.body ?? {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }
  if (!TG_TOKEN || !TG_CHAT) {
    console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }
  const src = (source || 'сайт').toString().slice(0, 60);
  saveLead(name.trim(), phone.trim(), src); // сохраняем в базу (best-effort)
  try {
    await tgSend(`🥋 Новая заявка с сайта!\nИмя: ${name.trim()}\nТелефон: ${phone.trim()}\nИсточник: ${src}`);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Telegram error:', err.message);
    return res.status(500).json({ error: 'telegram_error' });
  }
});

// ── Онлайн-помощник (ИИ-чат) ──────────────────────────────────────────────────
const CLUB_INFO = `
Juma Club — секция дзюдо и самбо для детей от 4 лет в Подмосковье.

Залы:
• ЖК «Весна» — Апрелевка, ул. Апрелевская 91А, 2 этаж
• Селятино — ул. Промышленная 80
• Эко-бунино — Коммунарка, квартал №195

Возрастные группы: 4–6 лет (малыши), 7–9 лет (дети), 10–13 лет (подростки), 14–18 лет (юниоры).
Занятия проходят 2–3 раза в неделю.
Расписание на сезон 2026/2027 ещё формируется — точное время нужно уточнять при записи.

Цены (абонемент в месяц, зависит от количества занятий 8 или 12):
• ЖК «Весна»: 8000–8500 ₽
• Селятино: 7500–8000 ₽
• Эко-бунино: 8500–9000 ₽

Первое пробное занятие — бесплатное и ни к чему не обязывает.
На первую тренировку: удобная спортивная форма (футболка, шорты или штаны) и сменная обувь или носки. Кимоно понадобится позже.
Безопасность: сначала учим правильно падать и группироваться, болевые и удушающие приёмы у детей запрещены, всё под контролем тренера.
Есть скидка 1500 ₽ на абонемент за приведённого друга.

Контакты: телефон +7 901 783-11-73, почта jumaclub@ya.ru, Telegram @juma_club, ВКонтакте vk.ru/juma.club.
`.trim();

const SYSTEM = `Ты — дружелюбный онлайн-помощник детской секции дзюдо и самбо «Juma Club». Отвечаешь родителям на сайте.

Информация о клубе (отвечай только на её основе, не выдумывай фактов):
${CLUB_INFO}

Правила:
- Отвечай тепло, коротко и по-человечески, на русском. 1–4 предложения.
- На типовые вопросы (возраст, цены, адреса, как записаться, что взять на тренировку, безопасность) отвечай сам.
- Точное расписание по дням ты не знаешь — предложи уточнить при записи и оставить контакт.
- Если вопрос сложный, индивидуальный (перенос, возврат, жалоба, особый случай), или родитель просит связаться с человеком/руководителем — сначала вежливо попроси имя и телефон, а когда они есть, вызови инструмент escalate_to_director.
- Всегда мягко подводи к записи на бесплатное пробное занятие.`;

const TOOLS = [{
  name: 'escalate_to_director',
  description: 'Передать вопрос руководителю клуба, когда не можешь ответить уверенно, вопрос индивидуальный/сложный, это жалоба, или родитель просит человека. Перед вызовом узнай имя и телефон родителя.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Имя родителя' },
      contact: { type: 'string', description: 'Телефон или телеграм родителя' },
      question: { type: 'string', description: 'Краткая суть вопроса родителя' },
    },
    required: ['question'],
  },
}];

const MODEL = 'claude-haiku-4-5';

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }
  if (!process.env.ANTHROPIC_KEY) {
    console.error('ANTHROPIC_KEY not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  // Чистим и ограничиваем историю
  const convo = messages.slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? '').slice(0, 2000),
  })).filter(m => m.content.trim());

  try {
    let escalated = false;
    let r = await anthropic.messages.create({
      model: MODEL, max_tokens: 600, system: SYSTEM, tools: TOOLS, messages: convo,
    });

    let guard = 0;
    while (r.stop_reason === 'tool_use' && guard++ < 3) {
      const toolUse = r.content.find(b => b.type === 'tool_use');
      convo.push({ role: 'assistant', content: r.content });
      let result = 'ok';
      if (toolUse && toolUse.name === 'escalate_to_director') {
        escalated = true;
        const inp = toolUse.input || {};
        const name = inp.name || 'не указано';
        const contact = inp.contact || 'не указан';
        const question = inp.question || '';
        saveLead(name, contact, 'сайт-чат');
        try {
          await tgSend(`💬 Вопрос с сайта (онлайн-чат)\nИмя: ${name}\nКонтакт: ${contact}\nВопрос: ${question}`);
        } catch (e) {
          console.error('escalate telegram error:', e.message);
        }
        result = 'Вопрос передан руководителю. Сообщи родителю, что руководитель свяжется с ним в ближайшее время, и поблагодари.';
      }
      convo.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result }] });
      r = await anthropic.messages.create({
        model: MODEL, max_tokens: 600, system: SYSTEM, tools: TOOLS, messages: convo,
      });
    }

    const reply = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      || 'Извините, не расслышал вопрос. Повторите, пожалуйста.';
    return res.json({ reply, escalated });
  } catch (err) {
    console.error('chat error:', err.message);
    return res.status(500).json({ error: 'chat_error' });
  }
});

app.listen(PORT, () => console.log(`Juma Club server on port ${PORT}`));
