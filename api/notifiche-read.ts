import notificheReadHandler from "../src/apiHandlers/notifiche/[id]/read.js";

export default async function handler(req: any, res: any) {
  const idFromQuery = req.query?.id?.toString?.().trim?.();
  const idFromBody = req.body?.id?.toString?.().trim?.();
  const id = idFromQuery || idFromBody;

  req.query = {
    ...(req.query ?? {}),
    id
  };

  return notificheReadHandler(req, res);
}
