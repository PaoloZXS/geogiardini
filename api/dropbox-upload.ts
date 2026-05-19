import { createDbClient } from "../src/apiHandlers/db.js";
import { readCodici } from "../readCodici.js";

async function ensureNotificheEsecuzioniTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS notifiche_esecuzioni (id TEXT PRIMARY KEY, notifica_id TEXT NOT NULL UNIQUE, giardiniere_id TEXT NOT NULL, execution_date TEXT, notes TEXT NOT NULL DEFAULT '', photo_paths TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    []
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Method not allowed." }));
    return;
  }

  try {
    const { notificationId, executionDate, executionNotes, files } =
      req.body ?? {};

    if (!notificationId) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ success: false, message: "notificationId mancante." })
      );
      return;
    }

    const codici = await readCodici();
    const dropboxToken = codici.dropboxAccessToken;
    const dropboxFolder = codici.dropboxFolder?.trim() || "/";

    if (!dropboxToken) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Dropbox access token non configurato. Controlla Codici.txt."
        })
      );
      return;
    }

    const uploadFiles = Array.isArray(files) ? files : [];
    const db = await createDbClient();

    const notificationResult = await db.execute(
      "SELECT giardiniere_id FROM notifiche WHERE id = ? LIMIT 1",
      [notificationId]
    );
    const notificationRows = Array.isArray(notificationResult.rows)
      ? notificationResult.rows
      : [];
    const notificationRow = notificationRows[0] as any;
    const giardiniereId = notificationRow?.giardiniere_id?.toString?.();

    if (!giardiniereId) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Notifica non trovata o priva di giardiniere associato."
        })
      );
      return;
    }

    const uploadedPaths: string[] = [];

    for (const file of uploadFiles) {
      if (!file?.name || !file?.base64) continue;
      const fileBuffer = Buffer.from(file.base64, "base64");
      const normalizedFolder =
        dropboxFolder === "/"
          ? ""
          : dropboxFolder.startsWith("/")
            ? dropboxFolder
            : `/${dropboxFolder}`;
      const dropboxPath =
        `${normalizedFolder}/${Date.now()}-${notificationId}-${file.name}`.replace(
          /\/\/+/,
          "/"
        );

      const uploadResponse = await fetch(
        "https://content.dropboxapi.com/2/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${dropboxToken}`,
            "Content-Type": "application/octet-stream",
            "Dropbox-API-Arg": JSON.stringify({
              path: dropboxPath,
              mode: "add",
              autorename: true,
              mute: true,
              strict_conflict: false
            })
          },
          body: fileBuffer
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => "");
        console.error("Dropbox upload error", errorText);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: "Caricamento file su Dropbox fallito."
          })
        );
        return;
      }

      const uploadedFile = await uploadResponse.json();
      const filePath = uploadedFile.path_display || uploadedFile.path_lower;
      let shareUrl: string | null = null;

      const makeRawUrl = (sharedUrl: string) => {
        if (sharedUrl.includes("?")) {
          return sharedUrl
            .replace(/\?dl=0$/, "?raw=1")
            .replace(/\?dl=1$/, "?raw=1");
        }
        return `${sharedUrl}?raw=1`;
      };

      const createLinkResponse = await fetch(
        "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${dropboxToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            path: dropboxPath,
            settings: { requested_visibility: "public" }
          })
        }
      );

      if (createLinkResponse.ok) {
        const createLinkData = await createLinkResponse.json();
        shareUrl = createLinkData.url;
      } else {
        const fallbackResponse = await fetch(
          "https://api.dropboxapi.com/2/sharing/list_shared_links",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${dropboxToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ path: dropboxPath, direct_only: true })
          }
        );
        if (fallbackResponse.ok) {
          const fallbackData = await fallbackResponse.json();
          const links = Array.isArray(fallbackData.links)
            ? fallbackData.links
            : [];
          shareUrl = links[0]?.url ?? null;
        }
      }

      if (shareUrl) {
        uploadedPaths.push(makeRawUrl(shareUrl));
      } else if (filePath) {
        uploadedPaths.push(filePath);
      }
    }

    await ensureNotificheEsecuzioniTable(db);
    const executionResult = await db.execute(
      "SELECT id, photo_paths FROM notifiche_esecuzioni WHERE notifica_id = ? LIMIT 1",
      [notificationId]
    );
    const executionRows = Array.isArray(executionResult.rows)
      ? executionResult.rows
      : [];
    const existingExecution = executionRows[0] as any;
    const now = new Date().toISOString();

    let executionId = existingExecution?.id?.toString?.();
    let photoUrls: string[] = [];

    if (existingExecution?.photo_paths) {
      try {
        const parsed = JSON.parse(existingExecution.photo_paths);
        if (Array.isArray(parsed)) {
          photoUrls = parsed.filter(
            (item: unknown) => typeof item === "string"
          );
        }
      } catch {
        photoUrls = [];
      }
    }

    photoUrls = photoUrls.concat(uploadedPaths);

    if (executionId) {
      await db.execute(
        "UPDATE notifiche_esecuzioni SET execution_date = ?, notes = ?, photo_paths = ?, updated_at = ? WHERE id = ?",
        [
          executionDate || null,
          executionNotes || "",
          JSON.stringify(photoUrls),
          now,
          executionId
        ]
      );
    } else {
      executionId = crypto.randomUUID();
      await db.execute(
        "INSERT INTO notifiche_esecuzioni (id, notifica_id, giardiniere_id, execution_date, notes, photo_paths, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          executionId,
          notificationId,
          giardiniereId,
          executionDate || null,
          executionNotes || "",
          JSON.stringify(photoUrls),
          now,
          now
        ]
      );
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: true,
        uploadedPaths,
        executionDate,
        executionNotes,
        notificationId,
        executionId,
        photoUrls
      })
    );
  } catch (error) {
    console.error("Dropbox upload failed", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message: "Errore interno durante il caricamento su Dropbox."
      })
    );
  }
}
