import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import ClientePage from "./pages/ClientePage";
import GiardinierePage from "./pages/GiardinierePage";
import "./styles/login.css";

function App() {
  const [authenticatedRole, setAuthenticatedRole] = useState<
    "admin" | "cliente" | "giardiniere" | null
  >(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [pushNotification, setPushNotification] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setAuthResolved(true);
      return;
    }
    const stored = window.localStorage.getItem("loginRole");
    const storedUserId = window.localStorage.getItem("userId");

    if (stored === "admin") {
      setAuthenticatedRole("admin");
      setAuthResolved(true);
      return;
    }

    if ((stored === "cliente" || stored === "giardiniere") && storedUserId) {
      setAuthenticatedRole(stored);
      setAuthResolved(true);
      return;
    }

    window.localStorage.removeItem("loginRole");
    window.localStorage.removeItem("loginUsername");
    window.localStorage.removeItem("userId");
    setAuthenticatedRole(null);
    setAuthResolved(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator))
      return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") {
        setPushNotification("Nuova notifica ricevuta!");
        setTimeout(() => setPushNotification(null), 3000);
        window.localStorage.setItem(
          "pushNotificationReceived",
          Date.now().toString()
        );
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
  }, []);

  if (!authResolved) {
    return null;
  }

  const homeElement =
    authenticatedRole === "admin" ? (
      <Navigate to="/admin" replace />
    ) : authenticatedRole === "cliente" ? (
      <Navigate to="/cliente" replace />
    ) : authenticatedRole === "giardiniere" ? (
      <Navigate to="/giardiniere" replace />
    ) : (
      <LoginPage onLoginSuccess={(role) => setAuthenticatedRole(role)} />
    );

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={homeElement} />
        <Route path="/geologin" element={homeElement} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route
          path="/admin"
          element={
            authenticatedRole === "admin" ? (
              <AdminPage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/cliente"
          element={
            authenticatedRole === "cliente" ? (
              <ClientePage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/giardiniere"
          element={
            authenticatedRole === "giardiniere" ? (
              <GiardinierePage />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {pushNotification && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: "#4CAF50",
            color: "white",
            padding: "16px 24px",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            zIndex: 9999,
            fontSize: "14px",
            fontWeight: "bold"
          }}
        >
          {pushNotification}
        </div>
      )}
    </HashRouter>
  );
}

export default App;
