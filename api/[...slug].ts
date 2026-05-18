import appuntamentiHandler from "../src/apiHandlers/appuntamenti";
import attivitaHandler from "../src/apiHandlers/attivita";
import clientiHandler from "../src/apiHandlers/clienti";
import countsHandler from "../src/apiHandlers/counts";
import dbtestHandler from "../src/apiHandlers/dbtest";
import giardinieriHandler from "../src/apiHandlers/giardinieri";
import helloHandler from "../src/apiHandlers/hello";
import loginHandler from "../src/apiHandlers/login";
import notificheHandler from "../src/apiHandlers/notifiche";
import notificheReadHandler from "../src/apiHandlers/notifiche/[id]/read";
import pushPublicKeyHandler from "../src/apiHandlers/push-public-key";
import pushSubscriptionHandler from "../src/apiHandlers/push-subscription";
import pushTestHandler from "../src/apiHandlers/push-test";

export default async function handler(req: any, res: any) {
  const slug = req.query?.slug;
  let rawPath = "";

  if (Array.isArray(slug)) {
    rawPath = slug.join("/");
  } else if (typeof slug === "string") {
    rawPath = slug;
  } else if (typeof req.url === "string") {
    const match = req.url.match(/^\/api\/(.*?)(?:\?|#|$)/);
    rawPath = match?.[1] ?? "";
  }

  const pathSegments = rawPath.split("/").filter(Boolean);
  const route = pathSegments.join("/");

  if (route === "") {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Route not found." }));
    return;
  }

  const primary = pathSegments[0];
  const remainingSegments = pathSegments.slice(1);
  req.params = {
    slug: remainingSegments,
    id: remainingSegments[0]?.toString?.() ?? null,
    action: remainingSegments[1]?.toString?.() ?? null
  };

  switch (primary) {
    case "appuntamenti":
      return appuntamentiHandler(req, res);
    case "attivita":
      return attivitaHandler(req, res);
    case "clienti":
      return clientiHandler(req, res);
    case "counts":
      return countsHandler(req, res);
    case "dbtest":
      return dbtestHandler(req, res);
    case "giardinieri":
      return giardinieriHandler(req, res);
    case "hello":
      return helloHandler(req, res);
    case "login":
      return loginHandler(req, res);
    case "notifiche":
      if (remainingSegments[1] === "read" && remainingSegments[0]) {
        req.query = { ...(req.query ?? {}), id: remainingSegments[0] };
        return notificheReadHandler(req, res);
      }
      return notificheHandler(req, res);
    case "push-public-key":
      return pushPublicKeyHandler(req, res);
    case "push-subscription":
      return pushSubscriptionHandler(req, res);
    case "push-test":
      return pushTestHandler(req, res);
    default:
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, message: "Route not found." }));
      return;
  }
}
