export default async function handler(_req: any, res: any) {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.toString().trim() ?? '';
    if (!publicKey) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: false,
          publicKey: null,
          message: 'VAPID_PUBLIC_KEY non configurata su Vercel (Environment Variables).'
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
