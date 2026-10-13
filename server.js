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
async function saveLead(name, phone, source, hall) {
  if (!pool) return;
  try {
    await pool.query(
      "INSERT INTO leads (name, phone, hall, status, created_date, source) VALUES ($1,$2,$3,'new',CURRENT_DATE,$4)",
      [
        String(name).slice(0, 120),
        String(phone).slice(0, 40),
        String(hall || '').slice(0, 60),
        String(source || 'сайт').slice(0, 60),
      ]
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
  const { name, phone, source, hall } = req.body ?? {};
  if (!name || !phone) {
    return res.status(400).json({ error: 'name and phone are required' });
  }
  if (!TG_TOKEN || !TG_CHAT) {
    console.error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
    return res.status(500).json({ error: 'server_misconfigured' });
  }
  const src  = (source || 'сайт').toString().slice(0, 60);
  const zal  = (hall || '').toString().slice(0, 60);
  saveLead(name.trim(), phone.trim(), src, zal); // сохраняем в базу (best-effort)
  try {
    await tgSend(
      `🥋 Новая заявка с сайта!\nИмя: ${name.trim()}\nТелефон: ${phone.trim()}` +
      (zal ? `\nЗал: ${zal}` : '') +
      `\nИсточник: ${src}`
    );
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
• ЖК «Весна» — Апрелевка, ул. Ясная, 1 (с 1 сентября занятия в новом зале, в доме по тому же адресу)
• Селятино — ул. Промышленная 80
• Эко-бунино — Коммунарка, квартал №195

Возрастные группы: младшие — 4–7 лет, старшие — от 7 лет.
Занятия проходят 2–3 раза в неделю, ходить можно в удобные дни.

Расписание на сезон 2026/2027.
ЖК «Весна» (Апрелевка, ул. Ясная, 1):
• вт, чт 09:30–11:00 — старшие (для тех, кто учится во вторую смену)
• вт, чт 15:00–16:30 — старшие
• вт, чт 18:00–19:30 — старшие
• пн–пт 19:30–20:15 — младшие (любые удобные дни)
• сб 10:00–10:45 — младшие
• сб 11:00–12:30 — старшие
Селятино (ул. Промышленная 80):
• пн, ср, пт 15:30–16:30 — старшие
• пн, ср, пт 17:00–18:30 — старшие
• пн, ср, пт 18:30–19:15 — младшие
Эко-бунино (Коммунарка, квартал №195):
• вт 18:30–19:30 младшие, 19:30–20:30 старшие
• чт 18:15–19:15 младшие, 19:15–20:15 старшие
• сб 18:30–19:30 младшие, 19:30–20:30 старшие

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

// ── КИОСК В ЗАЛЕ ─────────────────────────────────────────────────────────────
// Планшет на стене: отметка посещения и просмотр абонемента.
// Остаток занятий — финансовая информация, поэтому отдаём только после ввода
// последних 4 цифр телефона родителя. Список имён на планшете и так виден всем в зале.

// Опознание — только по личной карточке ребёнка (QR с уникальным токеном).
// Списка имён на планшете нет: чужую карточку не подберёшь и чужие данные не увидишь.

function tokenOf(req) {
  return String(req.body?.token || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

// Сервер живёт в UTC, а тренировки идут по Москве. Без пересчёта поздняя вечерняя
// отметка попадёт в предыдущую дату, поэтому «сегодня» для киоска всегда московское.
const MSK_TODAY = `(now() AT TIME ZONE 'Europe/Moscow')::date`;

async function findByToken(token) {
  const { rows } = await pool.query(
    `SELECT name, hall, belt, belt_date, total, left_count, abon_start, days, train_time, photo
       FROM students WHERE kiosk_token = $1 LIMIT 1`,
    [token]
  );
  return rows[0] || null;
}

// карточка ученика по токену: остаток занятий, пояс, расписание
app.post('/api/kiosk/card', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'no_db' });
  const token = tokenOf(req);
  if (token.length < 6) return res.status(400).json({ error: 'bad_token' });
  try {
    const s = await findByToken(token);
    if (!s) return res.status(404).json({ error: 'not_found' });

    const vis = await pool.query(
      `SELECT count(*)::int AS n FROM attendance
        WHERE child_name = $1 AND visit_date >= ${MSK_TODAY} - 30`,
      [s.name]
    );
    const today = await pool.query(
      `SELECT 1 FROM attendance WHERE child_name = $1 AND visit_date = ${MSK_TODAY} LIMIT 1`,
      [s.name]
    );
    s.visits_30 = vis.rows[0]?.n ?? 0;
    s.checked_today = today.rowCount > 0;
    res.json({ ok: true, student: s });
  } catch (e) {
    console.error('kiosk/card:', e.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// отметка посещения по токену
app.post('/api/kiosk/checkin', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'no_db' });
  const token = tokenOf(req);
  if (token.length < 6) return res.status(400).json({ error: 'bad_token' });
  try {
    const s = await findByToken(token);
    if (!s) return res.status(404).json({ error: 'not_found' });

    const dup = await pool.query(
      `SELECT 1 FROM attendance WHERE child_name = $1 AND visit_date = ${MSK_TODAY} LIMIT 1`,
      [s.name]
    );
    if (dup.rowCount) {
      return res.json({ ok: true, already: true, name: s.name, left: s.left_count });
    }
    await pool.query(
      `INSERT INTO attendance (child_name, visit_date, status) VALUES ($1, ${MSK_TODAY}, 'came')`,
      [s.name]
    );
    const upd = await pool.query(
      `UPDATE students SET left_count = COALESCE(left_count, 0) - 1
        WHERE name = $1 RETURNING left_count`,
      [s.name]
    );
    res.json({ ok: true, name: s.name, left: upd.rows[0]?.left_count ?? null });
  } catch (e) {
    console.error('kiosk/checkin:', e.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// Расписание в базе пишут по-разному: «Вт/Чт», «Пн-Пт», «Пн,Ср,Пт» — поэтому
// разбираем любую запись в список дней, а не сравниваем строки целиком.
const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEK_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function dayList(cell) {
  const s = String(cell || '');
  const range = s.match(/(Пн|Вт|Ср|Чт|Пт|Сб|Вс)\s*[-–—]\s*(Пн|Вт|Ср|Чт|Пт|Сб|Вс)/);
  if (range) {
    const a = WEEK.indexOf(range[1]), b = WEEK.indexOf(range[2]);
    if (a >= 0 && b >= a) return WEEK.slice(a, b + 1);
  }
  return WEEK.filter((d) => s.includes(d));
}

// у части учеников время записано как «С 18:30» или «Напр. 15:00» — берём часы
function normTime(v) {
  const m = String(v || '').match(/(\d{1,2}):(\d{2})/);
  return m ? String(m[1]).padStart(2, '0') + ':' + m[2] : '';
}
function minutes(t) {
  const m = normTime(t).match(/^(\d\d):(\d\d)$/);
  return m ? +m[1] * 60 + +m[2] : null;
}

// В карточке ученика стоит его обычное время, но зал по дням работает по-разному:
// в субботу в ЖК Весна тренировки в 10:00 и 11:00, а не в 18:00. Поэтому время
// всегда берём из расписания зала, а ученика ставим в слот его группы.
// Группу ученика узнаём по тому слоту, в чьё время он ходит в обычные дни.
function groupOf(student, hallSlots) {
  const t = minutes(student.train_time);
  const exact = hallSlots.find((s) => normTime(s.time) === normTime(student.train_time));
  if (exact) return exact.age_group;
  if (t == null) return null;
  let best = null, bestDiff = Infinity;
  for (const s of hallSlots) {
    const st = minutes(s.time);
    if (st == null) continue;
    const diff = Math.abs(st - t);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return bestDiff <= 90 ? best.age_group : null;   // дальше 1.5 часа — это уже другая группа
}

// из нескольких сегодняшних слотов одной группы (у старших три смены) берём тот,
// что ближе к обычному времени ученика
function pickSlot(student, todaySlots) {
  const mine = todaySlots.filter((s) => s.age_group === student.group);
  if (!mine.length) return null;
  if (mine.length === 1) return mine[0];
  const t = minutes(student.train_time);
  if (t == null) return mine[0];
  const exact = mine.find((s) => normTime(s.time) === normTime(student.train_time));
  if (exact) return exact;
  return mine.reduce((a, b) =>
    Math.abs(minutes(b.time) - t) < Math.abs(minutes(a.time) - t) ? b : a);
}

// Фото лежат в базе как data:image/...;base64 по 30–90 КБ. В списке группы их
// может быть под сотню, поэтому отдаём отдельным запросом и разрешаем кешировать.
app.get('/api/kiosk/photo', async (req, res) => {
  if (!pool) return res.sendStatus(503);
  const token = String(req.query.token || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  if (token.length < 6) return res.sendStatus(400);
  try {
    const { rows } = await pool.query(
      `SELECT photo FROM students WHERE kiosk_token = $1 LIMIT 1`, [token]
    );
    const m = String(rows[0]?.photo || '').match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    if (!m) return res.sendStatus(404);
    res.set('Cache-Control', 'private, max-age=86400');
    res.type(m[1]).send(Buffer.from(m[2], 'base64'));
  } catch (e) {
    console.error('kiosk/photo:', e.message);
    res.sendStatus(500);
  }
});

// расписание и состав группы на сегодня для одного зала
app.get('/api/kiosk/today', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'no_db' });
  const hall = String(req.query.hall || '').trim().slice(0, 60);
  try {
    const halls = (await pool.query(
      `SELECT DISTINCT hall FROM schedule WHERE nullif(hall,'') IS NOT NULL ORDER BY hall`
    )).rows.map((r) => r.hall);

    const { rows: [now] } = await pool.query(
      `SELECT ${MSK_TODAY} AS d,
              extract(isodow FROM ${MSK_TODAY})::int AS dow,
              extract(day FROM ${MSK_TODAY})::int AS dd,
              extract(month FROM ${MSK_TODAY})::int AS mm`
    );
    const short = WEEK[now.dow - 1];
    const date_label = WEEK_FULL[now.dow - 1] + ', ' + now.dd + ' ' + MONTHS[now.mm - 1];

    if (!hall) return res.json({ ok: true, need_hall: true, halls, today: short, date_label });

    const hallSlots = (await pool.query(
      `SELECT age_group, day, time FROM schedule WHERE hall = $1`, [hall]
    )).rows;
    const todaySlots = hallSlots
      .filter((r) => dayList(r.day).includes(short))
      .sort((a, b) => (minutes(a.time) ?? 1e9) - (minutes(b.time) ?? 1e9));

    const kids = (await pool.query(
      `SELECT s.name, s.kiosk_token, s.days, s.train_time,
              (nullif(s.photo,'') IS NOT NULL) AS has_photo,
              (a.child_name IS NOT NULL) AS checked
         FROM students s
         LEFT JOIN attendance a
                ON a.child_name = s.name AND a.visit_date = ${MSK_TODAY}
        WHERE s.hall = $1 AND COALESCE(s.frozen, false) = false
        ORDER BY s.name`,
      [hall]
    )).rows.filter((r) => dayList(r.days).includes(short));

    const slots = todaySlots.map((s) => ({
      time: normTime(s.time),
      time_label: String(s.time || ''),
      group: s.age_group || '',
      students: [],
    }));
    const other = [];   // кого не удалось отнести к группе — не теряем, показываем отдельно

    for (const k of kids) {
      k.group = groupOf(k, hallSlots);
      const slot = k.group ? pickSlot(k, todaySlots) : null;
      const row = { name: k.name, token: k.kiosk_token, checked: k.checked, photo: k.has_photo };
      if (slot) slots[todaySlots.indexOf(slot)].students.push(row);
      else other.push(row);
    }
    if (other.length) {
      slots.push({ time: '', time_label: 'Время уточните у тренера', group: '', students: other });
    }

    res.json({ ok: true, hall, halls, today: short, date_label, slots });
  } catch (e) {
    console.error('kiosk/today:', e.message);
    res.status(500).json({ error: 'db_error' });
  }
});

// ── Заявки из лид-форм ВКонтакте ─────────────────────────────────────────────
// VK умеет слать письма на почту админа, но письма теряются: четыре заявки
// пролежали незамеченными четыре дня. Поэтому принимаем событие напрямую и
// шлём в телеграм тем же путём, что и заявки с сайта.
const VK_CONFIRMATION = process.env.VK_CONFIRMATION || '';
const VK_SECRET = process.env.VK_SECRET || '';

// в ответах формы ключи стандартные, но у своих вопросов они произвольные
function pickAnswer(answers, keys) {
  for (const k of keys) {
    const hit = answers.find(a => (a.key || '').toLowerCase() === k);
    if (hit && hit.answer) return String(hit.answer).trim();
  }
  return '';
}

app.post('/api/vk-callback', async (req, res) => {
  const body = req.body || {};

  // подтверждение адреса при подключении Callback API
  if (body.type === 'confirmation') {
    return res.send(VK_CONFIRMATION);
  }

  // секрет задаётся в настройках сообщества; без него чужой мог бы слать заявки
  if (VK_SECRET && body.secret !== VK_SECRET) {
    console.error('vk-callback: неверный secret');
    return res.send('ok');
  }

  // VK повторяет доставку, пока не получит «ok», поэтому отвечаем сразу,
  // а разбираем событие уже после ответа
  res.send('ok');

  if (body.type !== 'lead_forms_new') return;

  try {
    const o = body.object || {};
    const answers = Array.isArray(o.answers) ? o.answers : [];
    const name = pickAnswer(answers, ['first_name', 'name', 'фамилия и имя', 'имя']) || 'Без имени';
    const phone = pickAnswer(answers, ['phone_number', 'phone', 'телефон']);
    const extra = answers
      .filter(a => !['first_name', 'name', 'phone_number', 'phone', 'last_name'].includes((a.key || '').toLowerCase()))
      .map(a => `${a.question || a.key}: ${a.answer}`)
      .join('\n');

    const form = o.form_name || '';
    // зал вытаскиваем из названия формы: «Пробное — Апрелевка»
    const hall = /апрелевк/i.test(form) ? 'Апрелевка'
      : /селятин/i.test(form) ? 'Селятино'
      : /бунино|коммунарк/i.test(form) ? 'Эко-бунино' : '';

    saveLead(name, phone, 'vk / лид-форма', hall);

    if (TG_TOKEN && TG_CHAT) {
      await tgSend(
        `🥋 Заявка из ВКонтакте!\nИмя: ${name}\nТелефон: ${phone || '—'}` +
        (hall ? `\nЗал: ${hall}` : '') +
        (form ? `\nФорма: ${form}` : '') +
        (extra ? `\n${extra}` : '') +
        `\n\nПерезвоните сегодня.`
      );
    }
  } catch (e) {
    console.error('vk-callback:', e.message);
  }
});

app.listen(PORT, () => console.log(`Juma Club server on port ${PORT}`));
