import fs from 'fs';
import path from 'path';

function getVapidPublicKey() {
  const envPublicKey = process.env.VAPID_PUBLIC_KEY?.toString().trim();
  if (envPublicKey) {
    return envPublicKey;
  }

  try {
    const vapidFilePath = path.resolve(process.cwd(), 'vapid-keys.json');
    if (fs.existsSync(vapidFilePath)) {
      const fileContent = fs.readFileSync(vapidFilePath, 'utf8');
      const vapidData = JSON.parse(fileContent);
      return vapidData?.publicKey?.toString()?.trim() ?? '';
    }
  } catch (error) {
    console.warn('Impossibile leggere vapid-keys.json per la chiave pubblica:', error);
  }

  return '';
}

export default async function handler(_req: any, res: any) {
  try {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          publicKey: null,
          message: 'VAPID_PUBLIC_KEY non configurata e vapid-keys.json non disponibile.'
        })
      );
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, publicKey }));
  } catch (error) {
    console.error('Fetching push public key failed', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        publicKey: null,
        message: 'Errore caricamento chiave pubblica push.'
      })
    );
  }
}
