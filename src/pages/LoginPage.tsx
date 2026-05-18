import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthField from "../components/AuthField";

type LoginPageProps = {
  onLoginSuccess: (role: "admin" | "cliente" | "giardiniere") => void;
};

const normalizeName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(
      /(^|\s)(\S)/g,
      (_, separator, char) => `${separator}${char.toUpperCase()}`
    );

type UserRole = "admin" | "cliente" | "giardiniere";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform?: string;
  }>;
};

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const navigate = useNavigate();
  const [loginRole, setLoginRole] = useState<UserRole>(() => {
    if (typeof window === "undefined") return "admin";
    const stored = window.localStorage.getItem("loginRole");
    return stored === "cliente" ||
      stored === "giardiniere" ||
      stored === "admin"
      ? stored
      : "admin";
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [wasPreviouslyInstalled, setWasPreviouslyInstalled] = useState(false);
  const [showOpenAppHint, setShowOpenAppHint] = useState(false);
  const errorTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setUsername("");
    setPassword("");
    setError("");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("loginRole", loginRole);
    }
  }, [loginRole]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    const installedBefore =
      window.localStorage.getItem("geogiardiniInstalled") === "1";
    setWasPreviouslyInstalled(installedBefore);
    setIsPwaInstalled(isStandalone);
  }, []);

  useEffect(() => {
    if (isPwaInstalled) {
      setShowInstallButton(false);
      setDeferredPrompt(null);
    }
  }, [isPwaInstalled]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    const handleAppInstalled = () => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("geogiardiniInstalled", "1");
      }
      setIsPwaInstalled(true);
      setInstallSuccess(true);
      setShowInstallButton(false);
      setDeferredPrompt(null);
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();

    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      if (typeof window !== "undefined") {
        window.localStorage.setItem("geogiardiniInstalled", "1");
      }
      setInstallSuccess(true);
      setShowInstallButton(false);
      setDeferredPrompt(null);
    } else {
      setShowInstallButton(false);
    }
  };

  const handleOpenInstalledApp = () => {
    setShowOpenAppHint(true);
  };

  useEffect(() => {
    if (!error) {
      return;
    }

    if (errorTimeoutRef.current) {
      window.clearTimeout(errorTimeoutRef.current);
    }

    errorTimeoutRef.current = window.setTimeout(() => {
      setError("");
      errorTimeoutRef.current = null;
    }, 2000);

    return () => {
      if (errorTimeoutRef.current) {
        window.clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [error]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError("Inserisci nome e codice.");
      return;
    }

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: loginRole,
          username: username.trim(),
          code: password.trim()
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        setError(result.message || "Credenziali errate. Riprovare");
        return;
      }

      if (loginRole !== "admin" && !result.id) {
        setError("Login riuscito ma id utente mancante. Riprova.");
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("loginRole", loginRole);
        window.localStorage.setItem(
          "loginUsername",
          loginRole === "admin" ? username.trim() : normalizeName(username)
        );
        if (result.id) {
          window.localStorage.setItem("userId", result.id.toString());
        }
      }

      onLoginSuccess(loginRole);
      if (loginRole === "admin") {
        navigate("/admin");
      } else if (loginRole === "cliente") {
        navigate("/cliente");
      } else {
        navigate("/giardiniere");
      }
    } catch (error) {
      console.error(error);
      setError("Errore di rete durante il login. Riprova.");
    }
  };

  const isAdmin = loginRole === "admin";
  const showInstalledNotice =
    (installSuccess || wasPreviouslyInstalled) && !isPwaInstalled;

  const firstLabel =
    loginRole === "admin"
      ? "Admin"
      : loginRole === "cliente"
        ? "Nome Cliente"
        : "Nome Giardiniere";
  const firstPlaceholder =
    loginRole === "admin"
      ? "Inserisci Admin"
      : loginRole === "cliente"
        ? "Inserisci Nome Cliente"
        : "Inserisci Nome Giardiniere";
  const secondLabel = isAdmin ? "Password" : "Codice";
  const secondPlaceholder = isAdmin ? "••••••••" : "Inserisci il codice";
  const secondType = isAdmin ? "password" : "text";

  if (showInstalledNotice) {
    return (
      <div className="login-page login-page--installed">
        <div className="login-page__top">
          <div className="login-page__brand">
            <div className="login-page__brand-icon">
              <span className="material-symbols-outlined" aria-hidden="true">
                park
              </span>
            </div>
            <h1 className="login-page__title">GeoGiardini</h1>
          </div>
        </div>

        <main className="login-page__main">
          <div className="login-page__intro">
            <h2>GeoGiardini installata!</h2>
            <p>
              L’app è già presente sul tuo dispositivo. Chiudi questa pagina e
              apri GeoGiardini dall’icona sullo schermo.
            </p>
            <p>
              Se hai aperto questo link dal browser, torna all’home screen e usa
              l’icona creata dal sistema.
            </p>
            <button
              type="button"
              className="login-page__submit mt-6"
              onClick={handleOpenInstalledApp}
            >
              Apri l’app installata
            </button>
            {showOpenAppHint && (
              <p className="login-page__caption mt-4">
                L’app può essere avviata solo dall’icona sul tuo dispositivo.
                Chiudi questa scheda e usa l’icona GeoGiardini.
              </p>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-page__top">
        <div className="login-page__brand">
          <div className="login-page__brand-icon">
            <span className="material-symbols-outlined" aria-hidden="true">
              park
            </span>
          </div>
          <h1 className="login-page__title">GeoGiardini</h1>
        </div>
      </div>

      <main className="login-page__main">
        <div className="login-page__intro">
          <h2>Benvenuto</h2>
          <p>Gestione completa delle aree verdi</p>
        </div>

        {showInstallButton && (
          <div className="login-page__install-wrapper">
            <button
              type="button"
              className="login-page__install-button"
              onClick={handleInstallClick}
            >
              Installa GeoGiardini
            </button>
          </div>
        )}

        <form
          className="login-page__form"
          autoComplete="off"
          onSubmit={handleSubmit}
        >
          <div className="flex items-center justify-between gap-3 mb-4">
            {(["admin", "cliente", "giardiniere"] as UserRole[]).map((role) => (
              <button
                key={role}
                type="button"
                className={`login-page__role-button h-11 flex-1 rounded-full border px-4 text-sm font-bold transition ${
                  loginRole === role
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant bg-surface text-on-surface hover:bg-surface-container-high"
                }`}
                onClick={() => {
                  setLoginRole(role);
                  setUsername("");
                  setPassword("");
                  setError("");
                }}
              >
                {role === "admin"
                  ? "Admin"
                  : role === "cliente"
                    ? "Cliente"
                    : "Giardiniere"}
              </button>
            ))}
          </div>

          <AuthField
            id="username"
            label={firstLabel}
            type="text"
            placeholder={firstPlaceholder}
            icon="person"
            value={username}
            onChange={(value) => setUsername(value)}
            autoComplete="off"
          />
          <AuthField
            id="password"
            label={secondLabel}
            type={secondType}
            placeholder={secondPlaceholder}
            icon={isAdmin ? "lock" : "key"}
            value={password}
            onChange={(value) => setPassword(value)}
            autoComplete={isAdmin ? "new-password" : "off"}
          />

          <div className="login-page__actions">
            <button className="login-page__submit" type="submit">
              Accedi
            </button>
          </div>
        </form>
      </main>

      {error && (
        <div
          className="login-page__error-overlay"
          role="alert"
          aria-live="assertive"
        >
          <div className="login-page__error-message">{error}</div>
        </div>
      )}

      <footer className="login-page__footer" style={{ marginTop: "3rem" }}>
        <p className="login-page__powered-by">
          Powered by Spectrum Italia 2026
        </p>
      </footer>

      <div className="login-page__background">
        <div className="login-page__glow login-page__glow--top" />
        <div className="login-page__glow login-page__glow--bottom" />
      </div>
    </div>
  );
}

export default LoginPage;
