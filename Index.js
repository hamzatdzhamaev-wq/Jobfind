require(‘dotenv’).config();
const Parser = require(‘rss-parser’);

const parser = new Parser({ timeout: 10000 });

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MIN_RATING = parseInt(process.env.MIN_RATING) || 6;

const RSS_FEEDS = [
{ name: ‘🇷🇺 FL.ru – Web’, url: ‘https://www.fl.ru/rss/all.xml?category=web’ },
{ name: ‘🇷🇺 FL.ru – Design’, url: ‘https://www.fl.ru/rss/all.xml?category=design’ },
{ name: ‘🌍 Upwork – Website’, url: ‘https://www.upwork.com/ab/feed/jobs/rss?q=website+development&sort=recency’ },
{ name: ‘🌍 Upwork – Web Design’, url: ‘https://www.upwork.com/ab/feed/jobs/rss?q=web+design&sort=recency’ },
{ name: ‘🌍 Upwork – DACH’, url: ‘https://www.upwork.com/ab/feed/jobs/rss?q=webseite+erstellen&sort=recency’ },
];

async function sendTelegram(text) {
await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
method: ‘POST’,
headers: { ‘Content-Type’: ‘application/json’ },
body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: ‘HTML’ }),
});
}

async function analyzeJob(title, description, source) {
try {
const response = await fetch(‘https://api.groq.com/openai/v1/chat/completions’, {
method: ‘POST’,
headers: {
‘Authorization’: `Bearer ${GROQ_API_KEY}`,
‘Content-Type’: ‘application/json’,
},
body: JSON.stringify({
model: ‘llama-3.1-8b-instant’,
max_tokens: 400,
messages: [{
role: ‘user’,
content: `Analysiere diesen Freelance Job als Web-Entwickler Experte:

Titel: ${title}
Quelle: ${source}
Beschreibung: ${description?.slice(0, 800) || ‘Keine’}

Antworte NUR in diesem JSON-Format:
{“bewertung”: <1-10>, “zusammenfassung”: “<2-3 Saetze>”, “budget”: “<Budget oder Nicht angegeben>”, “aufwand”: “<Klein/Mittel/Gross>”, “empfehlung”: “<Ja/Nein + Begruendung>”}`
}],
}),
});
const data = await response.json();
const text = data.choices?.[0]?.message?.content || ‘’;
const match = text.match(/{[\s\S]*}/);
if (!match) return null;
return JSON.parse(match[0]);
} catch (e) {
return null;
}
}

async function main() {
const seenRaw = process.env.SEEN_JOBS || ‘’;
const seenJobs = new Set(seenRaw.split(’,’).filter(Boolean));
let newJobs = 0;

for (const feed of RSS_FEEDS) {
try {
const parsed = await parser.parseURL(feed.url);
const items = parsed.items?.slice(0, 5) || [];

```
  for (const item of items) {
    const jobId = item.guid || item.link;
    if (!jobId || seenJobs.has(jobId)) continue;
    seenJobs.add(jobId);

    const analysis = await analyzeJob(
      item.title,
      item.contentSnippet || item.summary,
      feed.name
    );

    if (!analysis || analysis.bewertung < MIN_RATING) continue;

    const stars = '⭐'.repeat(Math.min(analysis.bewertung, 10));
    const emoji = analysis.bewertung >= 8 ? '🔥' : '✅';

    await sendTelegram(`${emoji} <b>Neuer Job!</b>
```

📌 <b>${item.title}</b>

📊 <b>Bewertung:</b> ${stars} (${analysis.bewertung}/10)
📝 <b>Was gesucht wird:</b> ${analysis.zusammenfassung}
💰 <b>Budget:</b> ${analysis.budget}
⏱ <b>Aufwand:</b> ${analysis.aufwand}
✉️ <b>Empfehlung:</b> ${analysis.empfehlung}

🌐 <b>Quelle:</b> ${feed.name}
🔗 <a href="${item.link}">Job ansehen</a>`);

```
    newJobs++;
    await new Promise(r => setTimeout(r, 2000));
  }
} catch (e) {
  console.error(`Fehler bei ${feed.name}:`, e.message);
}
```

}

console.log(`✅ ${newJobs} neue Jobs gesendet.`);
}

main().catch(console.error);
