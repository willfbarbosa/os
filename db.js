/**
 * MÓDULO DE BANCO DE DADOS SQLITE - ELETROZONE (os.eletrozone.net.br)
 * Gerencia a inicialização do esquema relacional, relatórios, usuários e auto-seeding.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

// Promise Wrappers para Facilidade com Async/Await
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

async function initDatabase() {
  console.log('🗄️ Inicializando Banco de Dados SQLite:', DB_PATH);

  // 1. Tabela de Usuários e Permissões (Padrão cadastro_maquinas)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      fullname TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      permissions TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  // 2. Tabela de Orçamentos (com suporte a fotos)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      clientName TEXT NOT NULL,
      clientCpfCnpj TEXT,
      clientAddress TEXT,
      clientCity TEXT,
      clientEmail TEXT,
      clientWhatsapp TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discountPercentage REAL NOT NULL DEFAULT 0,
      discountValue REAL NOT NULL DEFAULT 0,
      totalFinal REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDENTE',
      photos TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    )
  `);

  // Migration de segurança caso a coluna photos ainda não exista em banco legado
  try {
    await dbRun(`ALTER TABLE quotes ADD COLUMN photos TEXT`);
  } catch (e) {
    // Coluna já existe
  }

  // 3. Tabela de Itens do Orçamento
  await dbRun(`
    CREATE TABLE IF NOT EXISTS quote_items (
      id TEXT PRIMARY KEY,
      quoteId TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      description TEXT NOT NULL,
      unitPrice REAL NOT NULL DEFAULT 0,
      totalPrice REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (quoteId) REFERENCES quotes(id) ON DELETE CASCADE
    )
  `);

  // 4. Tabela de Recibos
  await dbRun(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      quoteId TEXT,
      clientName TEXT NOT NULL,
      clientCpfCnpj TEXT,
      clientAddress TEXT,
      clientCity TEXT,
      clientEmail TEXT,
      clientWhatsapp TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discountPercentage REAL NOT NULL DEFAULT 0,
      discountValue REAL NOT NULL DEFAULT 0,
      totalFinal REAL NOT NULL DEFAULT 0,
      declarationText TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT
    )
  `);

  // 5. Tabela de Itens do Recibo
  await dbRun(`
    CREATE TABLE IF NOT EXISTS receipt_items (
      id TEXT PRIMARY KEY,
      receiptId TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      description TEXT NOT NULL,
      unitPrice REAL NOT NULL DEFAULT 0,
      totalPrice REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (receiptId) REFERENCES receipts(id) ON DELETE CASCADE
    )
  `);

  // 6. Tabela de Logs e Auditoria
  await dbRun(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      action TEXT NOT NULL,
      user TEXT NOT NULL,
      description TEXT NOT NULL
    )
  `);

  await seedDefaultAdmin();
  console.log('✅ Banco de dados SQLite pronto para uso!');
}

async function seedDefaultAdmin() {
  const count = await dbGet('SELECT COUNT(*) as count FROM users');
  if (count.count === 0) {
    console.log('👤 Criando usuário administrador mestre padrão...');
    const adminId = 'usr_admin_master';
    const permissions = JSON.stringify({ canCreate: true, canEdit: true, canDelete: true, isAdmin: true });
    const createdAt = new Date().toISOString();

    await dbRun(
      `INSERT INTO users (id, username, fullname, password, role, permissions, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [adminId, 'admin', 'Administrador EletroZone', 'admin123', 'ADMIN', permissions, createdAt]
    );
    console.log('✅ Usuário master criado: admin / admin123');
  }
}

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet,
  initDatabase
};
