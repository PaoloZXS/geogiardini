import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import webpush from "web-push";
import { createClient } from "@libsql/client";

const databaseUrl = "libsql://geogiardini-paolozxs.aws-eu-west-1.turso.io";
const authToken =
  "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzgwODIzMzgsImlkIjoiMDE5ZGZkOGItZWEwMS03NGI2LTkzNTUtZDgxNjI4YjEzMDlkIiwicmlkIjoiZjFjYTE4ZDktOTMxOS00MmFkLTg4NTEtNDFiODVlMTEzOTNiIn0.ZwsaKrGcqLR_THEJ9OUGCE8pOK8mRs7P8fuOhodrsDwIPrff5UVKA2oR6ePLNxRm0cpcmQmaIS1eSV7T0D16CA";

const vapidKeysFile = path.resolve("vapid-keys.json");
let vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  privateKey: process.env.VAPID_PRIVATE_KEY ?? ""
};

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  try {
    if (fs.existsSync(vapidKeysFile)) {
      const saved = JSON.parse(fs.readFileSync(vapidKeysFile, "utf8"));
      if (saved.publicKey && saved.privateKey) {
        vapidKeys = {
          publicKey: saved.publicKey,
          privateKey: saved.privateKey
        };
      }
    }
  } catch (error) {
    console.warn("Impossibile leggere le chiavi VAPID da file:", error);
  }
}

if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
  const generatedKeys = webpush.generateVAPIDKeys();
  vapidKeys = {
    publicKey: generatedKeys.publicKey,
    privateKey: generatedKeys.privateKey
  };
  try {
    fs.writeFileSync(vapidKeysFile, JSON.stringify(vapidKeys), "utf8");
  } catch (error) {
    console.warn("Impossibile salvare le chiavi VAPID su file:", error);
  }
}

webpush.setVapidDetails(
  "mailto:admin@geogiardini.it",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

async function startServer() {
  const db = createClient({
    url: databaseUrl,
    authToken
  });

  const app = express();
  app.use(cors({ origin: ["http://localhost:4173", "http://127.0.0.1:4173"] }));
  app.use(bodyParser.json());

  app.post("/api/login", async (req, res) => {
    try {
      const { role, username, code } = req.body ?? {};

      if (!["admin", "giardiniere", "cliente"].includes(role)) {
        return res
          .status(400)
          .json({ success: false, message: "Ruolo di login non valido." });
      }

      if (!username || !code) {
        return res
          .status(400)
          .json({ success: false, message: "Nome e codice sono obbligatori." });
      }

      if (role === "admin") {
        if (username === "Angelo" && code === "A2026") {
          return res
            .status(200)
            .json({ success: true, role: "admin", username });
        }
        return res
          .status(401)
          .json({ success: false, message: "Credenziali admin errate." });
      }

      const query =
        role === "giardiniere"
          ? "SELECT id FROM giardinieri WHERE LOWER(username) = LOWER(?) AND codice = ? LIMIT 1"
          : "SELECT id FROM clienti WHERE LOWER(nome) = LOWER(?) AND codice = ? LIMIT 1";

      const result = await db.execute(query, [username.trim(), code.trim()]);
      const rows = Array.isArray(result.rows) ? result.rows : [];

      if (rows.length > 0) {
        const firstRow = rows[0] as any;
        const normalizeValue = (value: unknown) => {
          if (typeof value === "string") return value;
          if (value == null) return undefined;
          if (typeof (value as any).toString === "function")
            return (value as any).toString();
          return undefined;
        };

        const userId =
          normalizeValue(firstRow?.id) ??
          normalizeValue(firstRow?.ID) ??
          normalizeValue(firstRow?.Id) ??
          normalizeValue(Array.isArray(firstRow) ? firstRow[0] : undefined) ??
          normalizeValue(Object.values(firstRow)[0]) ??
          "";

        console.log("login query rows", rows, "userId", userId);

        return res.status(200).json({
          success: true,
          role,
          username,
          id: userId
        });
      }

      return res
        .status(401)
        .json({ success: false, message: "Credenziali errate." });
    } catch (error) {
      console.error("Login failed", error);
      return res
        .status(500)
        .json({ success: false, message: "Errore interno del server." });
    }
  });

  const tableName = "giardinieri";
  async function ensureGiardinieriTable() {
    const existingTablesResult = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('giardinieri', 'giardinieri_fix')",
      []
    );
    const existingTables = Array.isArray(existingTablesResult.rows)
      ? existingTablesResult.rows.map((row: any) => row[0]?.toString())
      : [];

    const hasGiardinieri = existingTables.includes("giardinieri");
    const hasFix = existingTables.includes("giardinieri_fix");

    if (!hasGiardinieri) {
      await db.execute(
        "CREATE TABLE giardinieri (id TEXT PRIMARY KEY, username TEXT NOT NULL, codice TEXT NOT NULL, created_at TEXT NOT NULL, attivo INTEGER NOT NULL DEFAULT 0)",
        []
      );
      if (hasFix) {
        await db.execute(
          "INSERT OR IGNORE INTO giardinieri (id, username, codice, created_at) SELECT CAST(id AS TEXT), CAST(username AS TEXT), CAST(codice AS TEXT), CAST(created_at AS TEXT) FROM giardinieri_fix",
          []
        );
        await db.execute("DROP TABLE IF EXISTS giardinieri_fix", []);
      }
      return;
    }

    if (hasFix) {
      const tempTable = "giardinieri_migration";
      await db.execute(
        `CREATE TABLE IF NOT EXISTS ${tempTable} (id TEXT PRIMARY KEY, username TEXT NOT NULL, codice TEXT NOT NULL, created_at TEXT NOT NULL, attivo INTEGER NOT NULL DEFAULT 0)`,
        []
      );
      await db.execute(
        `INSERT OR IGNORE INTO ${tempTable} (id, username, codice, created_at) SELECT CAST(id AS TEXT), CAST(username AS TEXT), CAST(codice AS TEXT), CAST(created_at AS TEXT) FROM giardinieri_fix`,
        []
      );
      await db.execute(
        `INSERT OR IGNORE INTO ${tempTable} (id, username, codice, created_at) SELECT CAST(id AS TEXT), CAST(username AS TEXT), CAST(codice AS TEXT), CAST(created_at AS TEXT) FROM giardinieri`,
        []
      );
      await db.execute("DROP TABLE IF EXISTS giardinieri_fix", []);
      await db.execute("DROP TABLE IF EXISTS giardinieri", []);
      await db.execute(`ALTER TABLE ${tempTable} RENAME TO giardinieri`, []);
    }

    const columnsResult = await db.execute(
      "PRAGMA table_info('giardinieri')",
      []
    );
    const columns = Array.isArray(columnsResult.rows)
      ? columnsResult.rows.map(
          (row: any) =>
            row?.name?.toString() ??
            row?.[1]?.toString() ??
            Object.values(row)[1]?.toString()
        )
      : [];

    if (!columns.includes("attivo")) {
      await db.execute(
        "ALTER TABLE giardinieri ADD COLUMN attivo INTEGER NOT NULL DEFAULT 0",
        []
      );
    }
  }

  app.post("/api/giardinieri", async (req, res) => {
    try {
      const { username, codice, attivo } = req.body as {
        username?: string;
        codice?: string;
        attivo?: boolean | number;
      };
      const trimmedUsername = username?.toString().trim();
      const trimmedCodice = codice?.toString().trim();
      const isActive = attivo ? 1 : 0;

      if (!trimmedUsername || !trimmedCodice) {
        return res.status(400).json({
          success: false,
          message: "Username e codice sono obbligatori."
        });
      }

      await ensureGiardinieriTable();

      const existing = await db.execute(
        `SELECT id FROM ${tableName} WHERE LOWER(username) = LOWER(?) LIMIT 1`,
        [trimmedUsername]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Username già presente. Usa un altro username."
        });
      }

      await db.execute(
        `INSERT INTO ${tableName} (id, username, codice, created_at, attivo) VALUES (?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          trimmedUsername,
          trimmedCodice,
          new Date().toISOString(),
          isActive
        ]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Saving giardinieri failed", error);
      return res
        .status(500)
        .json({ success: false, message: "Errore durante il salvataggio." });
    }
  });

  app.get("/api/giardinieri", async (req, res) => {
    try {
      await ensureGiardinieriTable();
      const result = await db.execute(
        "SELECT id, username, codice, created_at, attivo FROM giardinieri ORDER BY created_at DESC",
        []
      );
      return res.json({ success: true, giardinieri: result.rows || [] });
    } catch (error) {
      console.error("Fetching giardinieri failed", error);
      return res.status(500).json({
        success: false,
        giardinieri: [],
        message: "Errore caricamento giardinieri."
      });
    }
  });

  app.put("/api/giardinieri/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { username, codice, attivo } = req.body as {
        username?: string;
        codice?: string;
        attivo?: boolean | number;
      };
      const trimmedUsername = username?.toString().trim();
      const trimmedCodice = codice?.toString().trim();
      const isActive = attivo ? 1 : 0;

      if (!trimmedUsername || !trimmedCodice) {
        return res.status(400).json({
          success: false,
          message: "Username e codice sono obbligatori."
        });
      }

      await ensureGiardinieriTable();

      const existing = await db.execute(
        `SELECT id FROM ${tableName} WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1`,
        [trimmedUsername, id]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Username già presente. Usa un altro username."
        });
      }

      await db.execute(
        `UPDATE ${tableName} SET username = ?, codice = ?, attivo = ? WHERE id = ?`,
        [trimmedUsername, trimmedCodice, isActive, id]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Updating giardiniere failed", error);
      return res
        .status(500)
        .json({ success: false, message: "Errore durante l'aggiornamento." });
    }
  });

  app.delete("/api/giardinieri/:id", async (req, res) => {
    try {
      const { id } = req.params as { id: string };

      await ensureGiardinieriTable();
      await db.execute(`DELETE FROM ${tableName} WHERE id = ?`, [id]);

      return res.json({ success: true });
    } catch (error) {
      console.error("Deleting giardiniere failed", error);
      return res
        .status(500)
        .json({ success: false, message: "Errore durante l'eliminazione." });
    }
  });

  async function ensureClientiTable() {
    await db.execute(
      'CREATE TABLE IF NOT EXISTS clienti (id INTEGER PRIMARY KEY, nome TEXT, indirizzo TEXT, telefono TEXT, codice TEXT NOT NULL DEFAULT "", attivo INTEGER NOT NULL DEFAULT 1)',
      []
    );

    const columnsResult = await db.execute("PRAGMA table_info('clienti')", []);
    const columns = Array.isArray(columnsResult.rows)
      ? columnsResult.rows.map(
          (row: any) =>
            row?.name?.toString() ??
            row?.[1]?.toString() ??
            Object.values(row)[1]?.toString()
        )
      : [];

    if (!columns.includes("codice")) {
      await db.execute(
        'ALTER TABLE clienti ADD COLUMN codice TEXT NOT NULL DEFAULT ""',
        []
      );
    }

    if (!columns.includes("attivo")) {
      await db.execute(
        "ALTER TABLE clienti ADD COLUMN attivo INTEGER NOT NULL DEFAULT 1",
        []
      );
    }
  }

  app.post("/api/clienti", async (req, res) => {
    try {
      const { nome, indirizzo, telefono, codice, attivo } = req.body as {
        nome?: string;
        indirizzo?: string;
        telefono?: string;
        codice?: string;
        attivo?: boolean | number;
      };
      const trimmedNome = nome?.toString().trim();
      const trimmedIndirizzo = indirizzo?.toString().trim();
      const trimmedTelefono = telefono?.toString().trim() ?? "";
      const trimmedCodice = codice?.toString().trim();
      const isActive = attivo ? 1 : 0;

      if (!trimmedNome || !trimmedIndirizzo || !trimmedCodice) {
        return res.status(400).json({
          success: false,
          message: "Nome, indirizzo e codice sono obbligatori."
        });
      }

      await ensureClientiTable();

      const existingClient = await db.execute(
        "SELECT id FROM clienti WHERE LOWER(nome) = LOWER(?) LIMIT 1",
        [trimmedNome]
      );

      if (existingClient.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Cliente già presente. Usa un altro nome."
        });
      }

      await db.execute(
        "INSERT INTO clienti (nome, indirizzo, telefono, codice, attivo) VALUES (?, ?, ?, ?, ?)",
        [
          trimmedNome,
          trimmedIndirizzo,
          trimmedTelefono,
          trimmedCodice,
          isActive
        ]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Saving clienti failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante il salvataggio cliente."
      });
    }
  });

  app.get("/api/clienti", async (req, res) => {
    try {
      await ensureClientiTable();
      const result = await db.execute(
        "SELECT id, nome, indirizzo, telefono, codice, attivo FROM clienti ORDER BY id DESC",
        []
      );
      return res.json({ success: true, clienti: result.rows || [] });
    } catch (error) {
      console.error("Fetching clienti failed", error);
      return res.status(500).json({
        success: false,
        clienti: [],
        message: "Errore caricamento clienti."
      });
    }
  });

  app.put("/api/clienti/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { nome, indirizzo, telefono, codice, attivo } = req.body as {
        nome?: string;
        indirizzo?: string;
        telefono?: string;
        codice?: string;
        attivo?: boolean | number;
      };
      const trimmedNome = nome?.toString().trim();
      const trimmedIndirizzo = indirizzo?.toString().trim();
      const trimmedTelefono = telefono?.toString().trim() ?? "";
      const trimmedCodice = codice?.toString().trim();
      const isActive = attivo ? 1 : 0;

      if (!trimmedNome || !trimmedIndirizzo || !trimmedCodice) {
        return res.status(400).json({
          success: false,
          message: "Nome, indirizzo e codice sono obbligatori."
        });
      }

      await ensureClientiTable();

      const existing = await db.execute(
        "SELECT id FROM clienti WHERE LOWER(nome) = LOWER(?) AND id != ? LIMIT 1",
        [trimmedNome, id]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Cliente già presente. Usa un altro nome."
        });
      }

      await db.execute(
        "UPDATE clienti SET nome = ?, indirizzo = ?, telefono = ?, codice = ?, attivo = ? WHERE id = ?",
        [
          trimmedNome,
          trimmedIndirizzo,
          trimmedTelefono,
          trimmedCodice,
          isActive,
          id
        ]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Updating cliente failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante l'aggiornamento cliente."
      });
    }
  });

  app.delete("/api/clienti/:id", async (req, res) => {
    try {
      const { id } = req.params as { id: string };

      await ensureClientiTable();
      await db.execute("DELETE FROM clienti WHERE id = ?", [id]);

      return res.json({ success: true });
    } catch (error) {
      console.error("Deleting cliente failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante l'eliminazione cliente."
      });
    }
  });

  async function ensureAttivitaTable() {
    await db.execute(
      "CREATE TABLE IF NOT EXISTS attivita (id TEXT PRIMARY KEY, description TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
      []
    );
  }

  async function ensureAppuntamentiTable() {
    await db.execute(
      'CREATE TABLE IF NOT EXISTS appuntamenti (id TEXT PRIMARY KEY, data TEXT NOT NULL, cliente_id INTEGER NOT NULL, note TEXT NOT NULL DEFAULT "", created_at TEXT NOT NULL)',
      []
    );
  }

  async function ensureAppuntamentoGiardinieriTable() {
    await db.execute(
      "CREATE TABLE IF NOT EXISTS appuntamento_giardinieri (id TEXT PRIMARY KEY, appuntamento_id TEXT NOT NULL, giardiniere_id TEXT NOT NULL, UNIQUE(appuntamento_id, giardiniere_id))",
      []
    );
  }

  async function ensureAppuntamentoAttivitaTable() {
    await db.execute(
      "CREATE TABLE IF NOT EXISTS appuntamento_attivita (id TEXT PRIMARY KEY, appuntamento_id TEXT NOT NULL, description TEXT NOT NULL)",
      []
    );
  }

  async function ensureNotificheTable() {
    await db.execute(
      "CREATE TABLE IF NOT EXISTS notifiche (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, appuntamento_id TEXT NOT NULL, cliente_id TEXT, title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
      []
    );

    const columnsResult = await db.execute(
      "PRAGMA table_info('notifiche')",
      []
    );
    const rows = Array.isArray(columnsResult.rows) ? columnsResult.rows : [];
    const hasClienteId = rows.some((row: any) => {
      const colName = row?.name?.toString?.().toLowerCase?.();
      return colName === "cliente_id";
    });

    if (!hasClienteId) {
      try {
        await db.execute(
          "ALTER TABLE notifiche ADD COLUMN cliente_id TEXT",
          []
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        if (
          !message.includes("duplicate column name") &&
          !message.includes("already exists")
        ) {
          throw error;
        }
      }
    }
  }

  async function ensurePushSubscriptionsTable() {
    await db.execute(
      "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
      []
    );
  }

  async function cleanupStaleSubscription(endpoint: string) {
    try {
      await db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
    } catch (error) {
      console.error("Failed to cleanup stale push subscription", error);
    }
  }

  async function sendPushNotificationToSubscription(
    subscription: unknown,
    payload: unknown
  ) {
    try {
      console.log("Sending push notification to", (subscription as any)?.endpoint);
      await webpush.sendNotification(subscription as any, JSON.stringify(payload));
    } catch (error: any) {
      const statusCode = error?.statusCode;
      const endpoint = (subscription as any)?.endpoint;
      console.error("Error sending push notification:", statusCode, endpoint, error?.body || error?.message || error);
      if (statusCode === 410 || statusCode === 404) {
        if (endpoint) {
          await cleanupStaleSubscription(endpoint);
        }
      }
    }
  }

  async function sendPushNotifications(giardiniereIds: string[], payload: unknown) {
    if (giardiniereIds.length === 0) {
      return;
    }

    await ensurePushSubscriptionsTable();
    const placeholders = giardiniereIds.map(() => "?").join(",");
    const subscriptionsResult = await db.execute(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE giardiniere_id IN (${placeholders})`,
      giardiniereIds
    );
    const subscriptionRows = Array.isArray(subscriptionsResult.rows)
      ? subscriptionsResult.rows
      : [];

    for (const row of subscriptionRows) {
      const endpoint = row?.endpoint?.toString()?.trim();
      const p256dh = row?.p256dh?.toString()?.trim();
      const auth = row?.auth?.toString()?.trim();
      if (!endpoint || !p256dh || !auth) {
        continue;
      }

      await sendPushNotificationToSubscription(
        {
          endpoint,
          keys: {
            p256dh,
            auth
          }
        },
        payload
      );
    }
  }

  app.post("/api/appuntamenti", async (req, res) => {
    try {
      const { data, clienteId, giardinieriIds, attivita, note } = req.body as {
        data?: string;
        clienteId?: string | number;
        giardinieriIds?: unknown;
        attivita?: unknown;
        note?: string;
      };
      const trimmedData = data?.toString().trim();
      const trimmedClienteId = clienteId?.toString().trim();
      const selectedGiardinieri = Array.isArray(giardinieriIds)
        ? giardinieriIds
            .map((item) => item?.toString().trim())
            .filter((item) => item)
        : [];
      const selectedAttivita = Array.isArray(attivita)
        ? attivita.map((item) => item?.toString().trim()).filter((item) => item)
        : [];
      const noteText = note?.toString().trim() ?? "";

      if (
        !trimmedData ||
        !trimmedClienteId ||
        selectedGiardinieri.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Data, cliente e almeno un giardiniere sono obbligatori."
        });
      }

      await ensureClientiTable();
      await ensureGiardinieriTable();
      await ensureAppuntamentiTable();
      await ensureAppuntamentoGiardinieriTable();
      await ensureAppuntamentoAttivitaTable();
      await ensureNotificheTable();

      const clientResult = await db.execute(
        "SELECT nome FROM clienti WHERE id = ? LIMIT 1",
        [trimmedClienteId]
      );
      const clientRows = Array.isArray(clientResult.rows)
        ? clientResult.rows
        : [];
      const clienteNome = clientRows[0]?.nome?.toString?.() ?? "cliente";

      const appointmentId = crypto.randomUUID();
      await db.execute(
        "INSERT INTO appuntamenti (id, data, cliente_id, note, created_at) VALUES (?, ?, ?, ?, ?)",
        [
          appointmentId,
          trimmedData,
          trimmedClienteId,
          noteText,
          new Date().toISOString()
        ]
      );

      for (const giardiniereId of selectedGiardinieri) {
        await db.execute(
          "INSERT INTO appuntamento_giardinieri (id, appuntamento_id, giardiniere_id) VALUES (?, ?, ?)",
          [crypto.randomUUID(), appointmentId, giardiniereId]
        );
      }

      for (const activity of selectedAttivita) {
        await db.execute(
          "INSERT INTO appuntamento_attivita (id, appuntamento_id, description) VALUES (?, ?, ?)",
          [crypto.randomUUID(), appointmentId, activity]
        );
      }

      const formattedDate = new Date(trimmedData).toLocaleDateString("it-IT");
      const notificationTitle = `Nuovo appuntamento per ${clienteNome}`;
      const notificationMessage = `Cliente : ${clienteNome}\nAttività da svolgere : ${selectedAttivita.join(", ")}\nData Appuntamento : ${formattedDate}`;

      for (const giardiniereId of selectedGiardinieri) {
        await db.execute(
          "INSERT INTO notifiche (id, giardiniere_id, cliente_id, appuntamento_id, title, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            giardiniereId,
            trimmedClienteId,
            appointmentId,
            notificationTitle,
            notificationMessage,
            0,
            new Date().toISOString()
          ]
        );
      }

      return res.json({ success: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || "Errore interno del server.");
      console.error("Saving appuntamento failed", {
        error,
        body: req.body,
        errorMessage
      });
      return res.status(500).json({
        success: false,
        message: `Errore interno del server: ${errorMessage}. Richiesta: ${JSON.stringify(
          {
            data: req.body?.data,
            clienteId: req.body?.clienteId,
            giardinieriIds: req.body?.giardinieriIds,
            attivita: req.body?.attivita
          }
        )}`
      });
    }
  });

  app.get("/api/appuntamenti", async (req, res) => {
    try {
      await ensureAppuntamentiTable();
      await ensureAppuntamentoGiardinieriTable();
      await ensureAppuntamentoAttivitaTable();
      await ensureClientiTable();
      await ensureGiardinieriTable();

      const giardiniereId = req.query.giardiniereId?.toString()?.trim();
      const clienteId = req.query.clienteId?.toString()?.trim();

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (giardiniereId) {
        whereClauses.push("ag.giardiniere_id = ?");
        params.push(giardiniereId);
      }
      if (clienteId) {
        whereClauses.push("a.cliente_id = ?");
        params.push(clienteId);
      }

      const whereSql = whereClauses.length
        ? `WHERE ${whereClauses.join(" AND ")}`
        : "";

      const result = await db.execute(
        `SELECT
          a.id AS appointment_id,
          a.data AS appointment_date,
          a.cliente_id AS cliente_id,
          c.nome AS cliente_nome,
          a.note AS appointment_note,
          a.created_at AS appointment_created_at,
          gi.id AS giardiniere_id,
          gi.username AS giardiniere_username,
          aa.description AS activity_description
        FROM appuntamenti a
        LEFT JOIN clienti c ON c.id = a.cliente_id
        LEFT JOIN appuntamento_giardinieri ag ON ag.appuntamento_id = a.id
        LEFT JOIN giardinieri gi ON gi.id = ag.giardiniere_id
        LEFT JOIN appuntamento_attivita aa ON aa.appuntamento_id = a.id
        ${whereSql}
        ORDER BY a.data DESC, a.created_at DESC`,
        params
      );

      const rows = Array.isArray(result.rows) ? result.rows : [];
      const appointmentsMap = new Map<string, any>();

      for (const row of rows) {
        const appointmentId = row?.appointment_id?.toString();
        if (!appointmentId) continue;

        if (!appointmentsMap.has(appointmentId)) {
          appointmentsMap.set(appointmentId, {
            id: appointmentId,
            data: row?.appointment_date ?? "",
            clienteId: row?.cliente_id ?? "",
            clienteNome: row?.cliente_nome ?? "",
            note: row?.appointment_note ?? "",
            createdAt: row?.appointment_created_at ?? "",
            giardinieri: [],
            attivita: []
          });
        }

        const appointment = appointmentsMap.get(appointmentId);

        const giardiniereIdValue = row?.giardiniere_id?.toString();
        const giardiniereUsernameValue = row?.giardiniere_username?.toString();
        if (giardiniereIdValue && giardiniereUsernameValue) {
          if (
            !appointment.giardinieri.some(
              (item: any) => item.id === giardiniereIdValue
            )
          ) {
            appointment.giardinieri.push({
              id: giardiniereIdValue,
              username: giardiniereUsernameValue
            });
          }
        }

        const activityDescription = row?.activity_description?.toString();
        if (
          activityDescription &&
          !appointment.attivita.includes(activityDescription)
        ) {
          appointment.attivita.push(activityDescription);
        }
      }

      return res.json({
        success: true,
        appointments: Array.from(appointmentsMap.values())
      });
    } catch (error) {
      console.error("Fetching appuntamenti failed", error);
      return res.status(500).json({
        success: false,
        appointments: [],
        message: "Errore caricamento appuntamenti."
      });
    }
  });

  app.get("/api/push-public-key", async (_req, res) => {
    try {
      return res.json({ success: true, publicKey: vapidKeys.publicKey });
    } catch (error) {
      console.error("Fetching push public key failed", error);
      return res.status(500).json({
        success: false,
        publicKey: null,
        message: "Errore caricamento chiave pubblica per le notifiche push."
      });
    }
  });

  app.post("/api/push-subscription", async (req, res) => {
    try {
      const { giardiniereId, subscription } = req.body as {
        giardiniereId?: string;
        subscription?: {
          endpoint?: string;
          keys?: { p256dh?: string; auth?: string };
        };
      };

      const endpoint = subscription?.endpoint?.toString().trim();
      const p256dh = subscription?.keys?.p256dh?.toString().trim();
      const auth = subscription?.keys?.auth?.toString().trim();

      if (!giardiniereId || !endpoint || !p256dh || !auth) {
        return res.status(400).json({
          success: false,
          message: "Sottoscrizione push non valida."
        });
      }

      await ensureGiardinieriTable();
      await ensurePushSubscriptionsTable();

      const giardiniereResult = await db.execute(
        "SELECT id FROM giardinieri WHERE id = ? LIMIT 1",
        [giardiniereId]
      );
      const giardiniereRows = Array.isArray(giardiniereResult.rows)
        ? giardiniereResult.rows
        : [];

      if (giardiniereRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Giardiniere non trovato."
        });
      }

      const now = new Date().toISOString();
      await db.execute(
        "INSERT INTO push_subscriptions (id, giardiniere_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET giardiniere_id = excluded.giardiniere_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at",
        [
          crypto.randomUUID(),
          giardiniereId,
          endpoint,
          p256dh,
          auth,
          now,
          now
        ]
      );

      console.log(`Push subscription saved for giardiniere ${giardiniereId} (${endpoint})`);
      return res.json({ success: true });
    } catch (error) {
      console.error("Saving push subscription failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante il salvataggio della sottoscrizione push."
      });
    }
  });

  app.get("/api/push-subscriptions/count", async (_req, res) => {
    try {
      await ensurePushSubscriptionsTable();
      const result = await db.execute(
        "SELECT COUNT(*) AS count FROM push_subscriptions",
        []
      );
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const count = rows[0]?.count ?? 0;
      return res.json({ success: true, count });
    } catch (error) {
      console.error("Fetching push subscriptions count failed", error);
      return res.status(500).json({
        success: false,
        count: 0,
        message: "Errore durante il conteggio delle sottoscrizioni push."
      });
    }
  });

  app.get("/api/notifiche", async (req, res) => {
    try {
      await ensureNotificheTable();
      const giardiniereId = req.query.giardiniereId?.toString()?.trim();
      const readFilter = req.query.read?.toString()?.trim();

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (giardiniereId) {
        whereClauses.push("n.giardiniere_id = ?");
        params.push(giardiniereId);
      }

      if (readFilter === "0" || readFilter === "false") {
        whereClauses.push("n.read = 0");
      } else if (readFilter === "1" || readFilter === "true") {
        whereClauses.push("n.read = 1");
      }

      const whereSql = whereClauses.length
        ? `WHERE ${whereClauses.join(" AND ")}`
        : "";
      const result = await db.execute(
        `SELECT n.id, n.giardiniere_id, gi.username AS giardiniere_username, n.appuntamento_id, n.cliente_id, c.nome AS cliente_nome, n.title, n.message, n.read, n.created_at FROM notifiche n LEFT JOIN giardinieri gi ON gi.id = n.giardiniere_id LEFT JOIN clienti c ON c.id = n.cliente_id ${whereSql} ORDER BY n.created_at DESC`,
        params
      );

      const rows = Array.isArray(result.rows) ? result.rows : [];
      return res.json({ success: true, notifiche: rows });
    } catch (error) {
      console.error("Fetching notifiche failed", error);
      return res.status(500).json({
        success: false,
        notifiche: [],
        message: "Errore caricamento notifiche."
      });
    }
  });

  app.post("/api/notifiche", async (req, res) => {
    try {
      const { title, message, giardinieriIds, clienteId } = req.body as {
        title?: string;
        message?: string;
        giardinieriIds?: unknown;
        clienteId?: string | number;
      };

      const trimmedTitle =
        title?.toString().trim() || "Messaggio dall' Amministratore";
      const trimmedMessage = message?.toString().trim();
      const trimmedClienteId = clienteId?.toString().trim();
      const selectedGiardinieri = Array.isArray(giardinieriIds)
        ? giardinieriIds
            .map((item) => item?.toString().trim())
            .filter((item) => item)
        : [];

      if (!trimmedMessage) {
        return res
          .status(400)
          .json({ success: false, message: "Messaggio è obbligatorio." });
      }

      await ensureGiardinieriTable();
      await ensureNotificheTable();

      let recipients = selectedGiardinieri;
      if (recipients.length === 0) {
        const giardinieriResult = await db.execute(
          "SELECT id FROM giardinieri WHERE attivo = 1"
        );
        const giardinieriRows = Array.isArray(giardinieriResult.rows)
          ? giardinieriResult.rows
          : [];
        recipients = giardinieriRows
          .map((row: any) => row?.id?.toString?.())
          .filter((id) => id);
      }

      if (recipients.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Nessun giardiniere selezionato o attivo."
        });
      }

      const createdAt = new Date().toISOString();
      for (const giardiniereId of recipients) {
        await db.execute(
          "INSERT INTO notifiche (id, giardiniere_id, appuntamento_id, cliente_id, title, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            crypto.randomUUID(),
            giardiniereId,
            "",
            trimmedClienteId || null,
            trimmedTitle,
            trimmedMessage,
            0,
            createdAt
          ]
        );
      }

      await sendPushNotifications(recipients, {
        title: trimmedTitle,
        body: trimmedMessage,
        data: {
          type: "notifica",
          clienteId: trimmedClienteId || null,
          createdAt
        }
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Creating notifiche failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante la creazione dell'avviso."
      });
    }
  });

  app.put("/api/notifiche/:id/read", async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: "Id notifica mancante." });
      }

      await ensureNotificheTable();
      await db.execute("UPDATE notifiche SET read = 1 WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Marking notification read failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante l'aggiornamento della notifica."
      });
    }
  });

  app.post("/api/attivita", async (req, res) => {
    try {
      const { description } = req.body as { description?: string };
      const trimmedDescription = description?.toString().trim();

      if (!trimmedDescription) {
        return res.status(400).json({
          success: false,
          message: "La descrizione dell'attività è obbligatoria."
        });
      }

      await ensureAttivitaTable();
      await db.execute(
        "INSERT INTO attivita (id, description, completed, created_at) VALUES (?, ?, ?, ?)",
        [crypto.randomUUID(), trimmedDescription, 0, new Date().toISOString()]
      );

      return res.json({ success: true });
    } catch (error) {
      console.error("Saving attivita failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante il salvataggio dell'attività."
      });
    }
  });

  app.get("/api/attivita", async (req, res) => {
    try {
      await ensureAttivitaTable();
      const result = await db.execute(
        "SELECT id, description, completed, created_at FROM attivita ORDER BY LOWER(description) ASC",
        []
      );
      return res.json({ success: true, attivita: result.rows || [] });
    } catch (error) {
      console.error("Fetching attivita failed", error);
      return res.status(500).json({
        success: false,
        attivita: [],
        message: "Errore caricamento attività."
      });
    }
  });

  app.put("/api/attivita/:id", async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      const { description, completed } = req.body as {
        description?: string;
        completed?: boolean | number;
      };
      const trimmedDescription = description?.toString().trim();
      const isCompleted = completed ? 1 : 0;

      if (
        !id ||
        (trimmedDescription === undefined && completed === undefined)
      ) {
        return res
          .status(400)
          .json({ success: false, message: "Dati attività non validi." });
      }

      await ensureAttivitaTable();
      const updates: string[] = [];
      const params: any[] = [];

      if (trimmedDescription !== undefined) {
        updates.push("description = ?");
        params.push(trimmedDescription);
      }
      if (completed !== undefined) {
        updates.push("completed = ?");
        params.push(isCompleted);
      }
      params.push(id);

      await db.execute(
        `UPDATE attivita SET ${updates.join(", ")} WHERE id = ?`,
        params
      );
      return res.json({ success: true });
    } catch (error) {
      console.error("Updating attivita failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante l'aggiornamento dell'attività."
      });
    }
  });

  app.delete("/api/attivita/:id", async (req, res) => {
    try {
      const { id } = req.params as { id: string };
      await ensureAttivitaTable();
      await db.execute("DELETE FROM attivita WHERE id = ?", [id]);
      return res.json({ success: true });
    } catch (error) {
      console.error("Deleting attivita failed", error);
      return res.status(500).json({
        success: false,
        message: "Errore durante l'eliminazione dell'attività."
      });
    }
  });

  const extractCount = (result: any) => {
    const row = result.rows?.[0];
    if (!row) return 0;
    if (Array.isArray(row)) {
      return Number(row[0] ?? 0);
    }
    if (typeof row === "object") {
      const firstValue = Object.values(row)[0];
      return Number(firstValue ?? 0);
    }
    return 0;
  };

  app.get("/api/giardinieri/count", async (req, res) => {
    try {
      await ensureGiardinieriTable();
      const result = await db.execute("SELECT COUNT(*) FROM giardinieri", []);
      const count = extractCount(result);
      return res.json({ success: true, count });
    } catch (error) {
      console.error("Counting giardinieri failed", error);
      return res.status(500).json({
        success: false,
        count: 0,
        message: "Errore conteggio giardinieri."
      });
    }
  });

  app.get("/api/clienti/count", async (req, res) => {
    try {
      await ensureClientiTable();
      const result = await db.execute("SELECT COUNT(*) FROM clienti", []);
      const count = extractCount(result);
      return res.json({ success: true, count });
    } catch (error) {
      console.error("Counting clienti failed", error);
      return res.status(500).json({
        success: false,
        count: 0,
        message: "Errore conteggio clienti."
      });
    }
  });

  app.get("/api/counts", async (req, res) => {
    try {
      await ensureGiardinieriTable();
      await ensureClientiTable();
      const [
        giardResult,
        clientResult,
        giardActiveResult,
        giardInactiveResult,
        activeResult,
        inactiveResult
      ] = await Promise.all([
        db.execute("SELECT COUNT(*) FROM giardinieri", []),
        db.execute("SELECT COUNT(*) FROM clienti", []),
        db.execute("SELECT COUNT(*) FROM giardinieri WHERE attivo = 1", []),
        db.execute("SELECT COUNT(*) FROM giardinieri WHERE attivo = 0", []),
        db.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 1", []),
        db.execute("SELECT COUNT(*) FROM clienti WHERE attivo = 0", [])
      ]);
      return res.json({
        success: true,
        giardinieriCount: extractCount(giardResult),
        giardinieriActiveCount: extractCount(giardActiveResult),
        giardinieriInactiveCount: extractCount(giardInactiveResult),
        clientiCount: extractCount(clientResult),
        clientiActiveCount: extractCount(activeResult),
        clientiInactiveCount: extractCount(inactiveResult)
      });
    } catch (error) {
      console.error("Counting totals failed", error);
      return res.status(500).json({
        success: false,
        giardinieriCount: 0,
        giardinieriActiveCount: 0,
        giardinieriInactiveCount: 0,
        clientiCount: 0,
        clientiActiveCount: 0,
        clientiInactiveCount: 0,
        message: "Errore conteggio totali."
      });
    }
  });

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Turso proxy API server listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
