// LINE groupId notifier
// Botがグループに追加されると、オーナーの1:1トークにgroupIdとグループ名を通知する。
// 既存グループでは「groupid」または「グループID」とメッセージを送ると同様に通知される（グループ内には発言しない）。
const http = require('http');

const LINE_TOKEN = process.env.LINE_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const PATH_TOKEN = process.env.PATH_TOKEN;
const FORWARD_URL = process.env.FORWARD_URL; // 既存の受信先(contract-onboarding)へ全イベントを中継
const PORT = process.env.PORT || 3000;

async function forward(rawBody, signature) {
  if (!FORWARD_URL) return;
  try {
    const res = await fetch(FORWARD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature || '',
      },
      body: rawBody,
    });
    if (!res.ok) console.error('forward error', res.status, await res.text());
  } catch (e) {
    console.error('forward failed', e.message);
  }
}

async function lineApi(path, method, body) {
  const res = await fetch('https://api.line.me' + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + LINE_TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    console.error('LINE API error', path, res.status, await res.text());
    return null;
  }
  return res.json().catch(() => ({}));
}

const pushOwner = (text) =>
  lineApi('/v2/bot/message/push', 'POST', {
    to: OWNER_ID,
    messages: [{ type: 'text', text: text.slice(0, 4900) }],
  });

async function describeGroup(groupId) {
  const summary = await lineApi(`/v2/bot/group/${groupId}/summary`, 'GET');
  return summary && summary.groupName ? summary.groupName : '(名称取得不可)';
}

async function handleEvent(ev) {
  const src = ev.source || {};
  if (ev.type === 'join' && src.type === 'group') {
    const name = await describeGroup(src.groupId);
    await pushOwner(
      `📢 Botがグループに追加されました\n\nグループ名: ${name}\ngroupId:\n${src.groupId}\n\nこのグループに通知を流したい場合は、このIDを通知スクリプトの宛先に登録してください。`
    );
  } else if (ev.type === 'message' && src.type === 'group' && ev.message && ev.message.type === 'text') {
    const t = (ev.message.text || '').trim().toLowerCase();
    if (t === 'groupid' || t === 'グループid') {
      const name = await describeGroup(src.groupId);
      await pushOwner(`ℹ️ groupId照会\n\nグループ名: ${name}\ngroupId:\n${src.groupId}`);
    }
  }
}

http
  .createServer((req, res) => {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }
    if (req.method !== 'POST' || req.url !== `/webhook/${PATH_TOKEN}`) {
      res.writeHead(404);
      return res.end();
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      res.writeHead(200);
      res.end('OK');
      forward(body, req.headers['x-line-signature']);
      try {
        const events = (JSON.parse(body).events || []);
        for (const ev of events) await handleEvent(ev);
      } catch (e) {
        console.error('parse/handle error', e.message);
      }
    });
  })
  .listen(PORT, () => console.log('listening on', PORT));
