/**
 * SERVIDOR EXPRESS BACKEND COM SQLITE / LIBSQL - ELETROZONE (os.eletrozone.net.br)
 * Suporte a execução Local e Vercel Serverless Functions.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, dbAll, dbRun, dbGet } = require('./db');

const app = express();
let PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Servir arquivos estáticos do frontend (HTML, CSS, JS, Img)
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/css', express.static(path.join(process.cwd(), 'css')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(process.cwd(), 'js')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/img', express.static(path.join(process.cwd(), 'img')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use(express.static(path.join(process.cwd())));
app.use(express.static(path.join(__dirname)));

// Garante a inicialização do banco no ambiente Serverless
let isDbInitialized = false;
app.use(async (req, res, next) => {
  if (!isDbInitialized) {
    try {
      await initDatabase();
      isDbInitialized = true;
    } catch (e) {
      console.error('Erro ao inicializar DB:', e);
    }
  }
  next();
});

// Helper de Log Interno
async function recordLog(type, action, user, description) {
  try {
    const id = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const timestamp = new Date().toISOString();
    await dbRun(
      `INSERT INTO logs (id, timestamp, type, action, user, description) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, timestamp, type || 'INFO', action, user || 'Sistema', description]
    );
  } catch (err) {
    console.error('Erro ao salvar log:', err);
  }
}

// ROTA RAIZ (Servir SPA index.html)
app.get('/', (req, res) => {
  const publicIndex = path.join(process.cwd(), 'public', 'index.html');
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

// ============================================================================
// 1. ROTAS DE AUTENTICAÇÃO E GERENCIAMENTO DE USUÁRIOS
// ============================================================================

app.get('/api/auth/users', async (req, res) => {
  try {
    const rows = await dbAll('SELECT id, username, fullname, role, permissions, createdAt FROM users ORDER BY createdAt DESC');
    const users = rows.map(u => ({
      ...u,
      permissions: JSON.parse(u.permissions || '{}')
    }));
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/setup', async (req, res) => {
  try {
    const { fullname, username, password } = req.body;
    const count = await dbGet('SELECT COUNT(*) as count FROM users');
    if (count && count.count > 0) {
      return res.status(400).json({ success: false, message: 'Administrador mestre já cadastrado.' });
    }

    const userId = 'usr_' + Date.now();
    const permissions = JSON.stringify({ canCreate: true, canEdit: true, canDelete: true, isAdmin: true });
    const createdAt = new Date().toISOString();

    await dbRun(
      `INSERT INTO users (id, username, fullname, password, role, permissions, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, username.trim().toLowerCase(), fullname.trim(), password, 'ADMIN', permissions, createdAt]
    );

    await recordLog('AUTH', 'SETUP_ADMIN', username, `Criado administrador mestre ${fullname}`);
    const user = { id: userId, username: username.trim().toLowerCase(), fullname: fullname.trim(), role: 'ADMIN', permissions: JSON.parse(permissions) };
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
    }

    const user = await dbGet('SELECT * FROM users WHERE LOWER(username) = ?', [username.trim().toLowerCase()]);

    if (!user || user.password !== password) {
      return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos.' });
    }

    const userObj = {
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      role: user.role,
      permissions: JSON.parse(user.permissions || '{}')
    };

    await recordLog('AUTH', 'LOGIN_SUCCESS', user.fullname, `Login efetuado por ${user.username}`);
    res.json({ success: true, user: userObj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/users', async (req, res) => {
  try {
    const { id, fullname, username, password, permissions } = req.body;
    const permStr = JSON.stringify(permissions || { canCreate: true, canEdit: true, canDelete: false, isAdmin: false });
    const role = permissions?.isAdmin ? 'ADMIN' : 'USER';

    if (id) {
      if (password && password.trim() !== '') {
        await dbRun(
          `UPDATE users SET fullname = ?, username = ?, password = ?, role = ?, permissions = ? WHERE id = ?`,
          [fullname.trim(), username.trim().toLowerCase(), password, role, permStr, id]
        );
      } else {
        await dbRun(
          `UPDATE users SET fullname = ?, username = ?, role = ?, permissions = ? WHERE id = ?`,
          [fullname.trim(), username.trim().toLowerCase(), role, permStr, id]
        );
      }
      await recordLog('AUTH', 'USER_UPDATE', username, `Usuário ${username} atualizado`);
    } else {
      const newId = 'usr_' + Date.now();
      await dbRun(
        `INSERT INTO users (id, username, fullname, password, role, permissions, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId, username.trim().toLowerCase(), fullname.trim(), password || '123456', role, permStr, new Date().toISOString()]
      );
      await recordLog('AUTH', 'USER_CREATE', username, `Novo usuário ${username} cadastrado`);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/auth/users/:id', async (req, res) => {
  try {
    const user = await dbGet('SELECT username FROM users WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
    await recordLog('AUTH', 'USER_DELETE', 'Sistema', `Usuário ${user?.username || req.params.id} removido`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. ROTAS DE ORÇAMENTOS (QUOTES)
// ============================================================================

async function generateQuoteCode() {
  const currentYear = new Date().getFullYear();
  const rows = await dbAll(`SELECT code FROM quotes WHERE code LIKE 'ORC-${currentYear}-%'`);
  let maxSeq = 0;
  rows.forEach(r => {
    const parts = r.code.split('-');
    if (parts.length === 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  });
  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `ORC-${currentYear}-${nextSeq}`;
}

app.get('/api/quotes', async (req, res) => {
  try {
    const quotes = await dbAll('SELECT * FROM quotes ORDER BY createdAt DESC');
    const items = await dbAll('SELECT * FROM quote_items');

    const result = quotes.map(q => ({
      ...q,
      photos: JSON.parse(q.photos || '[]'),
      items: items.filter(it => it.quoteId === q.id)
    }));

    res.json({ success: true, quotes: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/quotes/:id', async (req, res) => {
  try {
    const quote = await dbGet('SELECT * FROM quotes WHERE id = ?', [req.params.id]);
    if (!quote) return res.status(404).json({ success: false, message: 'Orçamento não encontrado.' });

    const items = await dbAll('SELECT * FROM quote_items WHERE quoteId = ?', [req.params.id]);
    res.json({
      success: true,
      quote: {
        ...quote,
        photos: JSON.parse(quote.photos || '[]'),
        items
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/quotes', async (req, res) => {
  try {
    const { clientName, clientCpfCnpj, clientAddress, clientCity, clientEmail, clientWhatsapp, discountPercentage, items, photos, status, user } = req.body;

    const id = 'orc_' + Date.now();
    const code = await generateQuoteCode();
    const createdAt = new Date().toISOString();

    let subtotal = 0;
    const processedItems = (items || []).map((it, idx) => {
      const qty = parseFloat(it.quantity) || 0;
      const uPrice = parseFloat(it.unitPrice) || 0;
      const tPrice = qty * uPrice;
      subtotal += tPrice;
      return {
        id: 'qitem_' + Date.now() + '_' + idx,
        quoteId: id,
        quantity: qty,
        description: it.description || '',
        unitPrice: uPrice,
        totalPrice: tPrice
      };
    });

    const discPercent = parseFloat(discountPercentage) || 0;
    const discountValue = subtotal * (discPercent / 100);
    const totalFinal = Math.max(0, subtotal - discountValue);
    const photosJson = JSON.stringify(photos || []);

    await dbRun(
      `INSERT INTO quotes (id, code, clientName, clientCpfCnpj, clientAddress, clientCity, clientEmail, clientWhatsapp, subtotal, discountPercentage, discountValue, totalFinal, status, photos, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, clientName || '', clientCpfCnpj || '', clientAddress || '', clientCity || '', clientEmail || '', clientWhatsapp || '', subtotal, discPercent, discountValue, totalFinal, status || 'PENDENTE', photosJson, createdAt]
    );

    for (const it of processedItems) {
      await dbRun(
        `INSERT INTO quote_items (id, quoteId, quantity, description, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [it.id, it.quoteId, it.quantity, it.description, it.unitPrice, it.totalPrice]
      );
    }

    await recordLog('QUOTE', 'CREATE', user || 'Sistema', `Criado orçamento ${code} para ${clientName}`);
    res.json({ success: true, id, code });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/quotes/:id', async (req, res) => {
  try {
    const { clientName, clientCpfCnpj, clientAddress, clientCity, clientEmail, clientWhatsapp, discountPercentage, items, photos, status, user } = req.body;
    const quoteId = req.params.id;
    const updatedAt = new Date().toISOString();

    let subtotal = 0;
    const processedItems = (items || []).map((it, idx) => {
      const qty = parseFloat(it.quantity) || 0;
      const uPrice = parseFloat(it.unitPrice) || 0;
      const tPrice = qty * uPrice;
      subtotal += tPrice;
      return {
        id: it.id || ('qitem_' + Date.now() + '_' + idx),
        quoteId,
        quantity: qty,
        description: it.description || '',
        unitPrice: uPrice,
        totalPrice: tPrice
      };
    });

    const discPercent = parseFloat(discountPercentage) || 0;
    const discountValue = subtotal * (discPercent / 100);
    const totalFinal = Math.max(0, subtotal - discountValue);
    const photosJson = JSON.stringify(photos || []);

    await dbRun(
      `UPDATE quotes SET clientName = ?, clientCpfCnpj = ?, clientAddress = ?, clientCity = ?, clientEmail = ?, clientWhatsapp = ?, subtotal = ?, discountPercentage = ?, discountValue = ?, totalFinal = ?, status = ?, photos = ?, updatedAt = ?
       WHERE id = ?`,
      [clientName || '', clientCpfCnpj || '', clientAddress || '', clientCity || '', clientEmail || '', clientWhatsapp || '', subtotal, discPercent, discountValue, totalFinal, status || 'PENDENTE', photosJson, updatedAt, quoteId]
    );

    await dbRun('DELETE FROM quote_items WHERE quoteId = ?', [quoteId]);
    for (const it of processedItems) {
      await dbRun(
        `INSERT INTO quote_items (id, quoteId, quantity, description, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [it.id, it.quoteId, it.quantity, it.description, it.unitPrice, it.totalPrice]
      );
    }

    await recordLog('QUOTE', 'UPDATE', user || 'Sistema', `Atualizado orçamento ${quoteId}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.patch('/api/quotes/:id/status', async (req, res) => {
  try {
    const { status, user } = req.body;
    const quoteId = req.params.id;
    const updatedAt = new Date().toISOString();

    const q = await dbGet('SELECT code FROM quotes WHERE id = ?', [quoteId]);
    if (!q) return res.status(404).json({ success: false, message: 'Orçamento não encontrado.' });

    await dbRun(`UPDATE quotes SET status = ?, updatedAt = ? WHERE id = ?`, [status, updatedAt, quoteId]);
    await recordLog('QUOTE', 'STATUS_CHANGE', user || 'Sistema', `Orçamento ${q.code} alterado para status ${status}`);

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const q = await dbGet('SELECT code FROM quotes WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM quotes WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM quote_items WHERE quoteId = ?', [req.params.id]);
    await recordLog('QUOTE', 'DELETE', 'Sistema', `Excluído orçamento ${q?.code || req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Converter Orçamento em Recibo
app.post('/api/quotes/:id/convert-to-receipt', async (req, res) => {
  try {
    const quoteId = req.params.id;
    const { user } = req.body;

    const quote = await dbGet('SELECT * FROM quotes WHERE id = ?', [quoteId]);
    if (!quote) return res.status(404).json({ success: false, message: 'Orçamento não encontrado.' });

    const quoteItems = await dbAll('SELECT * FROM quote_items WHERE quoteId = ?', [quoteId]);

    const receiptId = 'rec_' + Date.now();
    const receiptCode = await generateReceiptCode();
    const createdAt = new Date().toISOString();

    const formattedTotal = Number(quote.totalFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const declarationText = `Declaro aos devidos fins, que recebi a contia de R$ ${formattedTotal} de ${quote.clientName || 'Cliente'} portador do cpf/cnpj ${quote.clientCpfCnpj || '---'}, referente a serviços prestados descritos a cima.`;

    await dbRun(
      `INSERT INTO receipts (id, code, quoteId, clientName, clientCpfCnpj, clientAddress, clientCity, clientEmail, clientWhatsapp, subtotal, discountPercentage, discountValue, totalFinal, declarationText, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [receiptId, receiptCode, quoteId, quote.clientName, quote.clientCpfCnpj, quote.clientAddress, quote.clientCity, quote.clientEmail, quote.clientWhatsapp, quote.subtotal, quote.discountPercentage, quote.discountValue, quote.totalFinal, declarationText, createdAt]
    );

    for (const it of quoteItems) {
      const rItemId = 'ritem_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      await dbRun(
        `INSERT INTO receipt_items (id, receiptId, quantity, description, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [rItemId, receiptId, it.quantity, it.description, it.unitPrice, it.totalPrice]
      );
    }

    await dbRun(`UPDATE quotes SET status = 'CONVERTIDO', updatedAt = ? WHERE id = ?`, [createdAt, quoteId]);
    await recordLog('CONVERT', 'QUOTE_TO_RECEIPT', user || 'Sistema', `Convertido Orçamento ${quote.code} no Recibo ${receiptCode}`);

    res.json({ success: true, receiptId, receiptCode });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. ROTAS DE RECIBOS (RECEIPTS)
// ============================================================================

async function generateReceiptCode() {
  const currentYear = new Date().getFullYear();
  const rows = await dbAll(`SELECT code FROM receipts WHERE code LIKE 'REC-${currentYear}-%'`);
  let maxSeq = 0;
  rows.forEach(r => {
    const parts = r.code.split('-');
    if (parts.length === 3) {
      const num = parseInt(parts[2], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  });
  const nextSeq = String(maxSeq + 1).padStart(3, '0');
  return `REC-${currentYear}-${nextSeq}`;
}

app.get('/api/receipts', async (req, res) => {
  try {
    const receipts = await dbAll('SELECT * FROM receipts ORDER BY createdAt DESC');
    const items = await dbAll('SELECT * FROM receipt_items');

    const result = receipts.map(r => ({
      ...r,
      items: items.filter(it => it.receiptId === r.id)
    }));

    res.json({ success: true, receipts: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/receipts/:id', async (req, res) => {
  try {
    const receipt = await dbGet('SELECT * FROM receipts WHERE id = ?', [req.params.id]);
    if (!receipt) return res.status(404).json({ success: false, message: 'Recibo não encontrado.' });

    const items = await dbAll('SELECT * FROM receipt_items WHERE receiptId = ?', [req.params.id]);
    res.json({ success: true, receipt: { ...receipt, items } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/receipts', async (req, res) => {
  try {
    const { quoteId, clientName, clientCpfCnpj, clientAddress, clientCity, clientEmail, clientWhatsapp, discountPercentage, items, user } = req.body;

    const id = 'rec_' + Date.now();
    const code = await generateReceiptCode();
    const createdAt = new Date().toISOString();

    let subtotal = 0;
    const processedItems = (items || []).map((it, idx) => {
      const qty = parseFloat(it.quantity) || 0;
      const uPrice = parseFloat(it.unitPrice) || 0;
      const tPrice = qty * uPrice;
      subtotal += tPrice;
      return {
        id: 'ritem_' + Date.now() + '_' + idx,
        receiptId: id,
        quantity: qty,
        description: it.description || '',
        unitPrice: uPrice,
        totalPrice: tPrice
      };
    });

    const discPercent = parseFloat(discountPercentage) || 0;
    const discountValue = subtotal * (discPercent / 100);
    const totalFinal = Math.max(0, subtotal - discountValue);

    const formattedTotal = Number(totalFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const declarationText = `Declaro aos devidos fins, que recebi a contia de R$ ${formattedTotal} de ${clientName || 'Cliente'} portador do cpf/cnpj ${clientCpfCnpj || '---'}, referente a serviços prestados descritos a cima.`;

    await dbRun(
      `INSERT INTO receipts (id, code, quoteId, clientName, clientCpfCnpj, clientAddress, clientCity, clientEmail, clientWhatsapp, subtotal, discountPercentage, discountValue, totalFinal, declarationText, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, code, quoteId || null, clientName || '', clientCpfCnpj || '', clientAddress || '', clientCity || '', clientEmail || '', clientWhatsapp || '', subtotal, discPercent, discountValue, totalFinal, declarationText, createdAt]
    );

    for (const it of processedItems) {
      await dbRun(
        `INSERT INTO receipt_items (id, receiptId, quantity, description, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [it.id, it.receiptId, it.quantity, it.description, it.unitPrice, it.totalPrice]
      );
    }

    await recordLog('RECEIPT', 'CREATE', user || 'Sistema', `Criado recibo ${code} para ${clientName}`);
    res.json({ success: true, id, code });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/receipts/:id', async (req, res) => {
  try {
    const { quoteId, clientName, clientCpfCnpj, clientAddress, clientCity, clientEmail, clientWhatsapp, discountPercentage, items, user } = req.body;
    const receiptId = req.params.id;
    const updatedAt = new Date().toISOString();

    let subtotal = 0;
    const processedItems = (items || []).map((it, idx) => {
      const qty = parseFloat(it.quantity) || 0;
      const uPrice = parseFloat(it.unitPrice) || 0;
      const tPrice = qty * uPrice;
      subtotal += tPrice;
      return {
        id: it.id || ('ritem_' + Date.now() + '_' + idx),
        receiptId,
        quantity: qty,
        description: it.description || '',
        unitPrice: uPrice,
        totalPrice: tPrice
      };
    });

    const discPercent = parseFloat(discountPercentage) || 0;
    const discountValue = subtotal * (discPercent / 100);
    const totalFinal = Math.max(0, subtotal - discountValue);

    const formattedTotal = Number(totalFinal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const declarationText = `Declaro aos devidos fins, que recebi a contia de R$ ${formattedTotal} de ${clientName || 'Cliente'} portador do cpf/cnpj ${clientCpfCnpj || '---'}, referente a serviços prestados descritos a cima.`;

    await dbRun(
      `UPDATE receipts SET quoteId = ?, clientName = ?, clientCpfCnpj = ?, clientAddress = ?, clientCity = ?, clientEmail = ?, clientWhatsapp = ?, subtotal = ?, discountPercentage = ?, discountValue = ?, totalFinal = ?, declarationText = ?, updatedAt = ?
       WHERE id = ?`,
      [quoteId || null, clientName || '', clientCpfCnpj || '', clientAddress || '', clientCity || '', clientEmail || '', clientWhatsapp || '', subtotal, discPercent, discountValue, totalFinal, declarationText, updatedAt, receiptId]
    );

    await dbRun('DELETE FROM receipt_items WHERE receiptId = ?', [receiptId]);
    for (const it of processedItems) {
      await dbRun(
        `INSERT INTO receipt_items (id, receiptId, quantity, description, unitPrice, totalPrice)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [it.id, it.receiptId, it.quantity, it.description, it.unitPrice, it.totalPrice]
      );
    }

    await recordLog('RECEIPT', 'UPDATE', user || 'Sistema', `Atualizado recibo ${receiptId}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/receipts/:id', async (req, res) => {
  try {
    const r = await dbGet('SELECT code FROM receipts WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM receipts WHERE id = ?', [req.params.id]);
    await dbRun('DELETE FROM receipt_items WHERE receiptId = ?', [req.params.id]);
    await recordLog('RECEIPT', 'DELETE', 'Sistema', `Excluído recibo ${r?.code || req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 4. METRICAS DO DASHBOARD & LOGS
// ============================================================================

app.get('/api/metrics', async (req, res) => {
  try {
    const qCount = await dbGet('SELECT COUNT(*) as count FROM quotes');
    const rCount = await dbGet('SELECT COUNT(*) as count FROM receipts');
    const rTotal = await dbGet('SELECT SUM(totalFinal) as total FROM receipts');
    const qPending = await dbGet("SELECT COUNT(*) as count FROM quotes WHERE status = 'PENDENTE'");

    res.json({
      success: true,
      metrics: {
        totalQuotes: qCount ? (qCount.count || 0) : 0,
        totalReceipts: rCount ? (rCount.count || 0) : 0,
        totalRevenue: rTotal ? (rTotal.total || 0) : 0,
        pendingQuotes: qPending ? (qPending.count || 0) : 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const logs = await dbAll('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 300');
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/logs', async (req, res) => {
  try {
    await dbRun('DELETE FROM logs');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// CATCH-ALL SAFE: Apenas para navegação de páginas SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const publicIndex = path.join(process.cwd(), 'public', 'index.html');
  if (fs.existsSync(publicIndex)) return res.sendFile(publicIndex);
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

// Execução local
if (!process.env.VERCEL) {
  function startServer(portToUse) {
    const server = app.listen(portToUse, () => {
      console.log(`🚀 Servidor Eletro Zone WebApp rodando na porta ${portToUse}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`⚠️ Porta ${portToUse} em uso. Tentando porta ${portToUse + 1}...`);
        startServer(portToUse + 1);
      } else {
        console.error('❌ Erro no servidor:', err);
      }
    });
  }

  initDatabase().then(() => {
    startServer(PORT);
  }).catch(err => {
    console.error('❌ Erro fatal ao iniciar banco de dados:', err);
  });
}

module.exports = app;
