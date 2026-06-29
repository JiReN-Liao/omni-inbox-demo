import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SNAPSHOT_LIMIT = 100;
const BACKUP_LIMIT = 50;

export class DurableStore {
  constructor({ databasePath, legacyPath, backupDir, changePath, seed, normalize = (value) => value }) {
    this.databasePath = path.resolve(databasePath);
    this.legacyPath = legacyPath ? path.resolve(legacyPath) : null;
    this.backupDir = path.resolve(backupDir);
    this.changePath = path.resolve(changePath);
    this.seed = normalize(seed);
    this.normalize = normalize;
    this.lastBackupError = null;
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    fs.mkdirSync(this.backupDir, { recursive: true });
    this.openWithRecovery();
  }

  openWithRecovery() {
    const recovery = this.findExternalRecoveryRecord();
    try {
      this.db = this.openDatabase();
      const integrity = this.db.prepare("PRAGMA integrity_check").get();
      if (integrity?.integrity_check !== "ok") throw new Error("SQLite integrity check failed");
      this.initializeSchema();
      if (!this.db.prepare("SELECT 1 FROM app_state WHERE id = 1").get()) {
        this.writeInitialState(recovery?.state || this.seed, recovery?.version || 1);
      }
    } catch (error) {
      this.db?.close();
      this.quarantineCorruptDatabase();
      this.db = this.openDatabase();
      this.initializeSchema();
      this.writeInitialState(recovery?.state || this.seed, recovery?.version || 1);
      this.recoveredAtStartup = true;
      this.recoveryReason = error.message;
    }
  }

  openDatabase() {
    const db = new DatabaseSync(this.databasePath);
    try {
      db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL, checksum TEXT NOT NULL,
        version INTEGER NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS state_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT, version INTEGER NOT NULL, payload TEXT NOT NULL,
        checksum TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_state_snapshots_version ON state_snapshots(version DESC);
    `);
  }

  read() {
    const row = this.db.prepare("SELECT payload, checksum FROM app_state WHERE id = 1").get();
    const state = this.parseVerified(row);
    return state ? this.normalize(state) : this.restoreLatestValidState();
  }

  write(value) {
    const payload = JSON.stringify(this.normalize(value));
    const checksum = digest(payload);
    const current = this.db.prepare("SELECT payload, checksum, version, updated_at FROM app_state WHERE id = 1").get();
    const version = Number(current?.version || 0) + 1;
    const now = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (current && this.parseVerified(current)) {
        this.db.prepare("INSERT INTO state_snapshots (version, payload, checksum, created_at) VALUES (?, ?, ?, ?)")
          .run(current.version, current.payload, current.checksum, current.updated_at);
      }
      this.db.prepare(`
        INSERT INTO app_state (id, payload, checksum, version, updated_at) VALUES (1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, checksum = excluded.checksum,
          version = excluded.version, updated_at = excluded.updated_at
      `).run(payload, checksum, version, now);
      this.db.prepare(`DELETE FROM state_snapshots WHERE id NOT IN
        (SELECT id FROM state_snapshots ORDER BY version DESC LIMIT ?)`).run(SNAPSHOT_LIMIT);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    this.writeExternalBackup({ version, payload, checksum, createdAt: now });
    this.pulseChange(version);
    return version;
  }

  status() {
    const row = this.db.prepare("SELECT version, updated_at FROM app_state WHERE id = 1").get();
    const snapshots = this.db.prepare("SELECT COUNT(*) AS count FROM state_snapshots").get();
    return {
      engine: "sqlite",
      journalMode: "wal",
      synchronous: "full",
      integrity: this.db.prepare("PRAGMA integrity_check").get()?.integrity_check || "unknown",
      version: Number(row?.version || 0),
      updatedAt: row?.updated_at || null,
      snapshots: Number(snapshots?.count || 0),
      backups: this.listBackups().length,
      lastBackupError: this.lastBackupError,
      recoveredAtStartup: Boolean(this.recoveredAtStartup)
    };
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  writeInitialState(value, version = 1) {
    const payload = JSON.stringify(this.normalize(value));
    const checksum = digest(payload);
    const createdAt = new Date().toISOString();
    this.db.prepare("INSERT OR REPLACE INTO app_state (id, payload, checksum, version, updated_at) VALUES (1, ?, ?, ?, ?)")
      .run(payload, checksum, version, createdAt);
    this.writeExternalBackup({ version, payload, checksum, createdAt });
    this.pulseChange(version);
  }

  restoreLatestValidState() {
    const rows = this.db.prepare("SELECT version, payload, checksum FROM state_snapshots ORDER BY version DESC LIMIT ?").all(SNAPSHOT_LIMIT);
    for (const row of rows) {
      const state = this.parseVerified(row);
      if (state) {
        this.writeInitialState(state, row.version);
        return this.normalize(state);
      }
    }
    const external = this.findExternalRecoveryRecord();
    if (external) {
      this.writeInitialState(external.state, external.version);
      return this.normalize(external.state);
    }
    throw new Error("No valid durable state or backup could be recovered");
  }

  parseVerified(row) {
    if (!row?.payload || !row?.checksum || digest(row.payload) !== row.checksum) return null;
    try { return JSON.parse(row.payload); }
    catch { return null; }
  }

  writeExternalBackup(record) {
    try {
      const filename = `state-v${String(record.version).padStart(10, "0")}.json`;
      const target = path.join(this.backupDir, filename);
      const temporary = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(record), "utf8");
      fs.renameSync(temporary, target);
      for (const old of this.listBackups().slice(BACKUP_LIMIT)) fs.rmSync(path.join(this.backupDir, old), { force: true });
      this.lastBackupError = null;
    } catch (error) {
      this.lastBackupError = error.message;
    }
  }

  findExternalRecoveryRecord() {
    for (const filename of this.listBackups()) {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(this.backupDir, filename), "utf8"));
        if (record.payload && record.checksum === digest(record.payload)) {
          return { state: this.normalize(JSON.parse(record.payload)), version: Number(record.version || 1) };
        }
      } catch {
        /* Try the next backup. */
      }
    }
    if (this.legacyPath && fs.existsSync(this.legacyPath)) {
      try { return { state: this.normalize(JSON.parse(fs.readFileSync(this.legacyPath, "utf8"))), version: 1 }; }
      catch { /* Fall through to seed data. */ }
    }
    return null;
  }

  listBackups() {
    try {
      return fs.readdirSync(this.backupDir).filter((name) => /^state-v\d+\.json$/.test(name)).sort((a, b) => b.localeCompare(a));
    } catch {
      return [];
    }
  }

  quarantineCorruptDatabase() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    for (const suffix of ["", "-wal", "-shm"]) {
      const source = `${this.databasePath}${suffix}`;
      if (fs.existsSync(source)) fs.renameSync(source, `${source}.corrupt-${stamp}`);
    }
  }

  pulseChange(version) {
    try {
      const temporary = `${this.changePath}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${version}:${Date.now()}`, "utf8");
      fs.renameSync(temporary, this.changePath);
    } catch {
      /* Persistence succeeded; clients can recover on their next refresh. */
    }
  }
}

export function createDurableStore(options) {
  return new DurableStore(options);
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
