import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

function AdminPage() {
  const navigate = useNavigate();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [codice, setCodice] = useState("");
  const [nomeCliente, setNomeCliente] = useState("");
  const [indirizzoCliente, setIndirizzoCliente] = useState("");
  const [telefonoCliente, setTelefonoCliente] = useState("");
  const [clienteCodice, setClienteCodice] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<"success" | "error" | null>(
    null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [giardinieriCount, setGiardinieriCount] = useState<number>(0);
  const [giardinieriAttiviCount, setGiardinieriAttiviCount] =
    useState<number>(0);
  const [giardinieriDisattiviCount, setGiardinieriDisattiviCount] =
    useState<number>(0);
  const [clientiCount, setClientiCount] = useState<number>(0);
  const [clientiAttiviCount, setClientiAttiviCount] = useState<number>(0);
  const [clientiDisattiviCount, setClientiDisattiviCount] = useState<number>(0);
  const [giardinieriList, setGiardinieriList] = useState<
    Array<{
      id: string;
      username: string;
      codice: string;
      created_at: string;
      attivo?: boolean | number | string;
    }>
  >([]);
  const [clientiList, setClientiList] = useState<
    Array<{
      id: string;
      nome: string;
      indirizzo: string;
      telefono: string;
      codice?: string;
      attivo?: boolean | number;
    }>
  >([]);
  const [editingGiardiniereId, setEditingGiardiniereId] = useState<
    string | null
  >(null);
  const [editingClienteId, setEditingClienteId] = useState<string | null>(null);
  const [editingAttivitaId, setEditingAttivitaId] = useState<string | null>(
    null
  );
  const [giardiniereAttivo, setGiardiniereAttivo] = useState(false);
  const [clienteAttivo, setClienteAttivo] = useState(false);
  const [attivitaDescrizione, setAttivitaDescrizione] = useState("");
  const [attivitaList, setAttivitaList] = useState<
    Array<{ id: string; description: string; completed: boolean }>
  >([]);
  const [appuntamentoData, setAppuntamentoData] = useState("");
  const [appuntamentoClienteId, setAppuntamentoClienteId] =
    useState<string>("");
  const [appuntamentoGiardinieriIds, setAppuntamentoGiardinieriIds] = useState<
    string[]
  >([]);
  const [appuntamentoAttivita, setAppuntamentoAttivita] = useState<string[]>(
    []
  );
  const [appuntamentoNote, setAppuntamentoNote] = useState("");
  const [avvisiMessage, setAvvisiMessage] = useState("");
  const [avvisiClienteId, setAvvisiClienteId] = useState<string>("");
  const [avvisiGiardinieriIds, setAvvisiGiardinieriIds] = useState<string[]>(
    []
  );
  const [avvisiList, setAvvisiList] = useState<
    Array<{
      id: string;
      giardiniere_id: string;
      giardiniere_username?: string;
      cliente_id?: string;
      cliente_nome?: string;
      title: string;
      message: string;
      read: number;
      created_at: string;
    }>
  >([]);
  const [avvisiModalFilter, setAvvisiModalFilter] = useState<
    "unread" | "read" | null
  >(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: "giardiniere" | "cliente" | "attivita";
    id: string;
    label: string;
  } | null>(null);
  const [now, setNow] = useState(new Date());
  const activeGiardinieriList = giardinieriList.filter((giardiniere) => {
    const attivoValue = String(giardiniere.attivo);
    return attivoValue === "1" || attivoValue === "true";
  });
  const activeClientiList = clientiList.filter((cliente) => {
    const attivoValue = String(cliente.attivo);
    return attivoValue === "1" || attivoValue === "true";
  });
  const statusTimeoutRef = useRef<number | null>(null);
  const nomeClienteRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const hasLoadedAvvisiRef = useRef(false);
  const avvisiListRef = useRef<
    Array<{
      id: string;
      giardiniere_id: string;
      giardiniere_username?: string;
      cliente_id?: string;
      cliente_nome?: string;
      title: string;
      message: string;
      read: number;
      created_at: string;
    }>
  >([]);

  const showAdminDesktopNotification = async (message: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    try {
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }

      if (permission !== "granted") {
        return;
      }

      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification("GeoGiardini Admin", {
          body: message,
          icon: "/leaf-512.png",
          badge: "/leaf-512.png",
          tag: "admin-read-confirmation"
        });
        return;
      }

      new Notification("GeoGiardini Admin", {
        body: message,
        icon: "/leaf-512.png"
      });
    } catch (error) {
      console.error("Desktop notification admin failed", error);
    }
  };

  const registerAdminPushSubscription = async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return;
    }

    try {
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      if (!registration) {
        return;
      }

      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          return;
        }
      }

      if (Notification.permission !== "granted") {
        return;
      }

      const publicKeyResponse = await fetch("/api/push-public-key");
      const publicKeyData = await publicKeyResponse.json().catch(() => null);
      if (!publicKeyResponse.ok) {
        return;
      }

      const serverPublicKey = publicKeyData?.publicKey || "";
      const applicationServerKey = urlBase64ToUint8Array(serverPublicKey);
      if (!applicationServerKey.length) {
        return;
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      const subscriptionPayload =
        typeof subscription?.toJSON === "function"
          ? subscription.toJSON()
          : subscription;

      await fetch("/api/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: "admin",
          recipientId: "admin",
          subscription: subscriptionPayload
        })
      });
    } catch (error) {
      console.error("Admin push registration failed", error);
    }
  };

  const statusBoxClasses = `absolute left-1/2 top-1/2 z-[9999] w-[min(680px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl px-4 py-3 text-center text-sm font-medium shadow-2xl transition-transform duration-200 ${
    statusType === "success"
      ? "bg-emerald-100 text-emerald-950 border border-emerald-300"
      : "bg-red-100 text-error border border-red-300"
  }`;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(timer);
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void registerAdminPushSubscription();
  }, []);

  const clearStatusAfterDelay = () => {
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatusMessage(null);
      setStatusType(null);
      statusTimeoutRef.current = null;
    }, 2000);
  };

  const fetchGiardinieri = async () => {
    try {
      const res = await fetch("/api/giardinieri", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.error("Caricamento giardinieri fallito", res.status, body);
        return;
      }
      const data = await res.json();
      setGiardinieriList(
        Array.isArray(data.giardinieri)
          ? [...data.giardinieri].sort((a, b) =>
              a.username.localeCompare(b.username, "it", {
                sensitivity: "base"
              })
            )
          : []
      );
    } catch (error) {
      console.error("Caricamento giardinieri fallito", error);
    }
  };

  const fetchCounts = async () => {
    try {
      const res = await fetch("/api/counts", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.error("Conteggio totali fallito", res.status, body);
        return;
      }
      const data = await res.json();
      setGiardinieriCount(Number(data.giardinieriCount) || 0);
      setGiardinieriAttiviCount(Number(data.giardinieriActiveCount) || 0);
      setGiardinieriDisattiviCount(Number(data.giardinieriInactiveCount) || 0);
      setClientiCount(Number(data.clientiCount) || 0);
      setClientiAttiviCount(Number(data.clientiActiveCount) || 0);
      setClientiDisattiviCount(Number(data.clientiInactiveCount) || 0);
    } catch (error) {
      console.error("Caricamento conteggi fallito", error);
    }
  };

  useEffect(() => {
    fetchCounts();
    fetchGiardinieri();
    fetchClienti();
    fetchAttivita();
  }, []);

  useEffect(() => {
    fetchAvvisi();
    const intervalId = window.setInterval(() => {
      fetchAvvisi();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleActionClick = (action: string) => {
    setSelectedAction(action);
    setStatusMessage(null);
    setEditingGiardiniereId(null);
    setEditingClienteId(null);
    if (action === "clienti") {
      setClienteAttivo(false);
    }
    if (action === "giardinieri") {
      setGiardiniereAttivo(false);
    }
    if (action === "appuntamento-singolo") {
      setAppuntamentoData(new Date().toISOString().split("T")[0]);
    }
  };

  const handleSelectGiardiniere = (giardiniere: {
    id: string;
    username: string;
    codice: string;
    attivo?: boolean | number | string;
  }) => {
    setEditingGiardiniereId(giardiniere.id);
    setUsername(giardiniere.username);
    setCodice(giardiniere.codice);
    setGiardiniereAttivo(
      giardiniere.attivo === 1 ||
        giardiniere.attivo === "1" ||
        giardiniere.attivo === true ||
        giardiniere.attivo === "true"
    );
  };

  const handleClearGiardiniereForm = () => {
    setEditingGiardiniereId(null);
    setUsername("");
    setCodice("");
    setGiardiniereAttivo(false);
    setStatusMessage(null);
    setStatusType(null);
    usernameRef.current?.focus();
  };

  const fetchClienti = async () => {
    try {
      const res = await fetch("/api/clienti", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.error("Caricamento clienti fallito", res.status, body);
        return;
      }
      const data = await res.json();
      setClientiList(
        Array.isArray(data.clienti)
          ? [...data.clienti]
              .map((cliente) => ({
                ...cliente,
                id: cliente.id?.toString?.() ?? "",
                attivo:
                  cliente.attivo === 1 ||
                  cliente.attivo === "1" ||
                  cliente.attivo === true ||
                  cliente.attivo === "true"
              }))
              .sort((a, b) =>
                a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
              )
          : []
      );
    } catch (error) {
      console.error("Caricamento clienti fallito", error);
    }
  };

  const fetchAttivita = async () => {
    try {
      const res = await fetch("/api/attivita", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.error("Caricamento attivita fallito", res.status, body);
        return;
      }
      const data = await res.json();
      setAttivitaList(
        Array.isArray(data.attivita)
          ? [...data.attivita]
              .map((item: any) => ({
                id: item.id,
                description: item.description,
                completed:
                  item.completed === 1 ||
                  item.completed === "1" ||
                  item.completed === true
              }))
              .sort((a, b) =>
                a.description.localeCompare(b.description, "it", {
                  sensitivity: "base"
                })
              )
          : []
      );
    } catch (error) {
      console.error("Caricamento attivita fallito", error);
    }
  };

  const clearAvvisoForm = () => {
    setAvvisiMessage("");
    setAvvisiClienteId("");
    setAvvisiGiardinieriIds([]);
  };

  const toggleAvvisiGiardiniere = (id: string) => {
    setAvvisiGiardinieriIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const fetchAvvisi = async () => {
    try {
      const res = await fetch("/api/notifiche", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.text().catch(() => null);
        console.error("Caricamento avvisi fallito", res.status, body);
        return;
      }
      const data = await res.json();
      const nextAvvisi = Array.isArray(data.notifiche) ? data.notifiche : [];

      if (hasLoadedAvvisiRef.current) {
        const previousUnreadIds = new Set(
          avvisiListRef.current
            .filter((item) => item.read === 0)
            .map((item) => item.id)
        );

        const newlyRead = nextAvvisi.filter(
          (item) => item.read === 1 && previousUnreadIds.has(item.id)
        );

        if (newlyRead.length > 0) {
          const firstRead = newlyRead[0];
          const giardiniereName =
            firstRead.giardiniere_username || "Il giardiniere";
          const message =
            newlyRead.length === 1
              ? `${giardiniereName} ha letto l'avviso.`
              : `${newlyRead.length} giardinieri hanno letto gli avvisi.`;
          setStatusType("success");
          setStatusMessage(message);
          void showAdminDesktopNotification(message);
          clearStatusAfterDelay();
        }
      }

      hasLoadedAvvisiRef.current = true;
      avvisiListRef.current = nextAvvisi;
      setAvvisiList(nextAvvisi);
    } catch (error) {
      console.error("Caricamento avvisi fallito", error);
    }
  };

  const handleSelectCliente = (cliente: {
    id: string;
    nome: string;
    indirizzo: string;
    telefono: string;
    codice?: string;
    attivo?: boolean | number | string;
  }) => {
    setEditingClienteId(cliente.id);
    setNomeCliente(cliente.nome);
    setIndirizzoCliente(cliente.indirizzo);
    setTelefonoCliente(cliente.telefono);
    setClienteCodice(cliente.codice || "");
    setClienteAttivo(
      cliente.attivo === 1 ||
        cliente.attivo === "1" ||
        cliente.attivo === true ||
        cliente.attivo === "true"
    );
  };

  const handleSelectAttivita = (attivita: {
    id: string;
    description: string;
    completed: boolean;
  }) => {
    setEditingAttivitaId(attivita.id);
    setAttivitaDescrizione(attivita.description);
    setStatusMessage(null);
    setStatusType(null);
  };

  const clearAttivitaForm = () => {
    setEditingAttivitaId(null);
    setAttivitaDescrizione("");
    setStatusMessage(null);
    setStatusType(null);
  };

  const handleClearClienteForm = () => {
    setEditingClienteId(null);
    setNomeCliente("");
    setIndirizzoCliente("");
    setTelefonoCliente("");
    setClienteCodice("");
    setClienteAttivo(false);
    setStatusMessage(null);
    setStatusType(null);
    nomeClienteRef.current?.focus();
  };

  const clearAppuntamentoForm = () => {
    setAppuntamentoData(new Date().toISOString().split("T")[0]);
    setAppuntamentoClienteId("");
    setAppuntamentoGiardinieriIds([]);
    setAppuntamentoAttivita([]);
    setAppuntamentoNote("");
  };

  const unreadAvvisi = avvisiList.filter((item) => item.read === 0);
  const readAvvisi = avvisiList.filter((item) => item.read === 1);
  const [avvisiTimeFilter, setAvvisiTimeFilter] = useState<
    "today" | "week" | "month" | "all"
  >("all");
  const [selectedAvvisoId, setSelectedAvvisoId] = useState<string | null>(null);

  const filteredAvvisi =
    avvisiModalFilter === "read"
      ? readAvvisi
      : avvisiModalFilter === "unread"
        ? unreadAvvisi
        : [];

  const filteredAvvisiByTime = filteredAvvisi.filter((item) => {
    if (avvisiTimeFilter === "all") return true;
    const itemDate = new Date(item.created_at);
    if (Number.isNaN(itemDate.getTime())) return true;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const itemDay = new Date(
      itemDate.getFullYear(),
      itemDate.getMonth(),
      itemDate.getDate()
    );

    if (avvisiTimeFilter === "today") {
      return itemDay.getTime() === today.getTime();
    }

    if (avvisiTimeFilter === "week") {
      const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - (dayOfWeek - 1));
      return (
        itemDay.getTime() >= startOfWeek.getTime() &&
        itemDay.getTime() <= today.getTime()
      );
    }

    if (avvisiTimeFilter === "month") {
      return (
        itemDate.getFullYear() === today.getFullYear() &&
        itemDate.getMonth() === today.getMonth()
      );
    }

    return true;
  });

  const openAvvisiModal = (filter: "unread" | "read") => {
    setAvvisiModalFilter(filter);
    setSelectedAvvisoId(null);
  };

  const closeAvvisiModal = () => {
    setAvvisiModalFilter(null);
    setSelectedAvvisoId(null);
  };

  const handleCloseForm = () => {
    setSelectedAction(null);
    setUsername("");
    setCodice("");
    setNomeCliente("");
    setIndirizzoCliente("");
    setTelefonoCliente("");
    setClienteCodice("");
    setClienteAttivo(false);
    setAttivitaDescrizione("");
    setEditingGiardiniereId(null);
    setEditingClienteId(null);
    clearAppuntamentoForm();
    clearAvvisoForm();
    setStatusMessage(null);
    setStatusType(null);
    setDeleteConfirmation(null);
  };

  const toggleAppuntamentoAttivita = (activity: string) => {
    setAppuntamentoAttivita((current) =>
      current.includes(activity)
        ? current.filter((item) => item !== activity)
        : [...current, activity]
    );
  };

  const handleSaveAppuntamento = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !appuntamentoData.trim() ||
      !appuntamentoClienteId.trim() ||
      appuntamentoGiardinieriIds.length === 0
    ) {
      setStatusType("error");
      setStatusMessage(
        "Compila data, cliente e almeno un giardiniere prima di salvare."
      );
      clearStatusAfterDelay();
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const response = await fetch("/api/appuntamenti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: appuntamentoData,
          clienteId: appuntamentoClienteId,
          giardinieriIds: appuntamentoGiardinieriIds,
          attivita: appuntamentoAttivita,
          note: appuntamentoNote
        })
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result?.message ||
          `Errore durante il salvataggio dell'appuntamento. (${response.status} ${response.statusText})`;
        throw new Error(`Errore PWA: ${message}`);
      }

      setStatusType("success");
      setStatusMessage("Appuntamento salvato con successo.");
      clearStatusAfterDelay();
      clearAppuntamentoForm();
    } catch (error) {
      console.error("Salvataggio appuntamento fallito", error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Errore durante il salvataggio dell'appuntamento."
      );
      clearStatusAfterDelay();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAttivita = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!attivitaDescrizione.trim()) {
      setStatusType("error");
      setStatusMessage("Inserisci la descrizione dell'attività.");
      clearStatusAfterDelay();
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const url = editingAttivitaId
        ? `/api/attivita/${editingAttivitaId}`
        : "/api/attivita";
      const method = editingAttivitaId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: attivitaDescrizione.trim() })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.message || "Errore durante il salvataggio dell'attività."
        );
      }

      setAttivitaDescrizione("");
      setEditingAttivitaId(null);
      setStatusType("success");
      setStatusMessage(
        editingAttivitaId
          ? "Attività aggiornata con successo."
          : "Attività salvata con successo."
      );
      clearStatusAfterDelay();
      await fetchAttivita();
    } catch (error) {
      console.error("Salvataggio attività fallito", error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Errore durante il salvataggio dell'attività."
      );
      clearStatusAfterDelay();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAvviso = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!avvisiMessage.trim()) {
      setStatusType("error");
      setStatusMessage("Inserisci il messaggio prima di inviare l'avviso.");
      clearStatusAfterDelay();
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const selectedCliente = clientiList.find(
        (cliente) => cliente.id === avvisiClienteId
      );
      const title = selectedCliente
        ? "Nuovo avviso :"
        : "Messaggio dall' Amministratore";
      const messageBody = selectedCliente
        ? `Cliente : ${selectedCliente.nome}\nMessaggio : ${avvisiMessage.trim()}`
        : avvisiMessage.trim();

      const response = await fetch("/api/notifiche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          message: messageBody,
          clienteId: avvisiClienteId || undefined,
          giardinieriIds: avvisiGiardinieriIds
        })
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          result?.message || "Errore durante l'invio dell'avviso.";
        throw new Error(message);
      }

      setStatusType("success");
      setStatusMessage("Avviso inviato correttamente.");
      clearStatusAfterDelay();
      clearAvvisoForm();
      await fetchAvvisi();
    } catch (error) {
      console.error("Invio avviso fallito", error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error ? error.message : "Invio non riuscito. Riprovare"
      );
      clearStatusAfterDelay();
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAttivitaCompletion = async (id: string) => {
    const item = attivitaList.find((activity) => activity.id === id);
    if (!item) return;

    try {
      const response = await fetch(`/api/attivita/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !item.completed })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.message || "Errore durante l'aggiornamento dell'attività."
        );
      }

      await fetchAttivita();
    } catch (error) {
      console.error("Aggiornamento attività fallito", error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Errore durante l'aggiornamento dell'attività."
      );
      clearStatusAfterDelay();
    }
  };

  const handleDeleteAttivita = async (id: string) => {
    try {
      const response = await fetch(`/api/attivita/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          data?.message || "Errore durante l'eliminazione dell'attività."
        );
      }
      await fetchAttivita();
    } catch (error) {
      console.error("Eliminazione attività fallita", error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Errore durante l'eliminazione dell'attività."
      );
      clearStatusAfterDelay();
    }
  };

  const openDeleteConfirmation = (
    type: "giardiniere" | "cliente" | "attivita",
    id: string,
    label: string
  ) => {
    setDeleteConfirmation({ type, id, label });
    setStatusMessage(null);
    setStatusType(null);
  };

  const cancelDelete = () => {
    setDeleteConfirmation(null);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation) return;

    const { type, id } = deleteConfirmation;
    setDeleteConfirmation(null);

    if (type === "giardiniere") {
      await handleDeleteGiardiniere(id);
    } else if (type === "cliente") {
      await handleDeleteCliente(id);
    } else {
      await handleDeleteAttivita(id);
    }
  };

  const handleLogout = () => {
    handleCloseForm();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("userId");
      window.localStorage.removeItem("loginUsername");
      window.localStorage.removeItem("loginRole");
      window.location.replace("/#/geologin");
      return;
    }
    navigate("/geologin", { replace: true });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !codice.trim()) {
      setStatusType("error");
      setStatusMessage("Compila username e codice prima di salvare.");
      clearStatusAfterDelay();
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const url = editingGiardiniereId
        ? `/api/giardinieri/${editingGiardiniereId}`
        : "/api/giardinieri";
      const method = editingGiardiniereId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          codice: codice.trim(),
          attivo: giardiniereAttivo
        })
      });

      const text = await response.text();
      let result: { success?: boolean; message?: string } | null = null;

      if (text) {
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          console.warn("Non-JSON response from /api/giardinieri:", text);
        }
      }

      if (!response.ok || (result && result.success === false)) {
        const message = result?.message || `Errore server (${response.status})`;
        throw new Error(message);
      }

      if (!result || result.success !== true) {
        throw new Error("Risposta non valida dal server.");
      }

      setStatusType("success");
      setStatusMessage(
        editingGiardiniereId
          ? "Giardiniere aggiornato con successo."
          : "Dati salvati con successo."
      );
      await fetchCounts();
      await fetchGiardinieri();
      setEditingGiardiniereId(null);
      setUsername("");
      setCodice("");
      setGiardiniereAttivo(false);
      clearStatusAfterDelay();
    } catch (error) {
      console.error(error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Impossibile salvare i dati. Riprova."
      );
      clearStatusAfterDelay();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGiardiniere = async (id: string) => {
    setIsSaving(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const response = await fetch(`/api/giardinieri/${id}`, {
        method: "DELETE",
        cache: "no-store"
      });
      const text = await response.text();
      let result: { success?: boolean; message?: string } | null = null;

      if (text) {
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          console.warn("Non-JSON response from /api/giardinieri:", text);
        }
      }

      if (!response.ok || (result && result.success === false)) {
        const message = result?.message || `Errore server (${response.status})`;
        throw new Error(message);
      }

      if (!result || result.success !== true) {
        throw new Error("Risposta non valida dal server.");
      }

      setStatusType("success");
      setStatusMessage("Giardiniere eliminato con successo.");
      await fetchCounts();
      await fetchGiardinieri();
      if (editingGiardiniereId === id) {
        setEditingGiardiniereId(null);
        setUsername("");
        setCodice("");
      }
      clearStatusAfterDelay();
    } catch (error) {
      console.error(error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Impossibile eliminare il giardiniere. Riprova."
      );
      clearStatusAfterDelay();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCliente = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !nomeCliente.trim() ||
      !indirizzoCliente.trim() ||
      !clienteCodice.trim()
    ) {
      setStatusType("error");
      setStatusMessage("Nome, indirizzo e codice sono obbligatori.");
      clearStatusAfterDelay();
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const url = editingClienteId
        ? `/api/clienti/${editingClienteId}`
        : "/api/clienti";
      const method = editingClienteId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nomeCliente.trim(),
          indirizzo: indirizzoCliente.trim(),
          telefono: telefonoCliente.trim(),
          codice: clienteCodice.trim(),
          attivo: clienteAttivo
        })
      });

      const text = await response.text();
      let result: { success?: boolean; message?: string } | null = null;

      if (text) {
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          console.warn("Non-JSON response from /api/clienti:", text);
        }
      }

      if (!response.ok || (result && result.success === false)) {
        const message = result?.message || `Errore server (${response.status})`;
        throw new Error(message);
      }

      if (!result || result.success !== true) {
        throw new Error("Risposta non valida dal server.");
      }

      setStatusType("success");
      setStatusMessage(
        editingClienteId
          ? "Cliente aggiornato con successo."
          : "Cliente salvato con successo."
      );
      await fetchCounts();
      await fetchClienti();
      setEditingClienteId(null);
      setNomeCliente("");
      setIndirizzoCliente("");
      setTelefonoCliente("");
      setClienteCodice("");
      setClienteAttivo(false);
      clearStatusAfterDelay();
    } catch (error) {
      console.error(error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Impossibile salvare il cliente. Riprova."
      );
      clearStatusAfterDelay();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCliente = async (id: string) => {
    setIsSaving(true);
    setStatusMessage(null);
    setStatusType(null);

    try {
      const response = await fetch(`/api/clienti/${id}`, {
        method: "DELETE",
        cache: "no-store"
      });
      const text = await response.text();
      let result: { success?: boolean; message?: string } | null = null;

      if (text) {
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          console.warn("Non-JSON response from /api/clienti:", text);
        }
      }

      if (!response.ok || (result && result.success === false)) {
        const message = result?.message || `Errore server (${response.status})`;
        throw new Error(message);
      }

      if (!result || result.success !== true) {
        throw new Error("Risposta non valida dal server.");
      }

      setStatusType("success");
      setStatusMessage("Cliente eliminato con successo.");
      await fetchCounts();
      await fetchClienti();
      if (editingClienteId === id) {
        setEditingClienteId(null);
        setNomeCliente("");
        setIndirizzoCliente("");
        setTelefonoCliente("");
      }
      clearStatusAfterDelay();
    } catch (error) {
      console.error(error);
      setStatusType("error");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Impossibile eliminare il cliente. Riprova."
      );
      clearStatusAfterDelay();
    } finally {
      setIsSaving(false);
    }
  };

  const actionButtonClasses = (action: string) =>
    `flex items-center gap-sm p-md rounded-xl transition-all active:scale-95 w-full ${
      selectedAction === action
        ? "bg-primary text-on-primary border border-primary"
        : "bg-surface-container-low text-primary border border-surface-tint hover:bg-surface-container-high"
    }`;

  return (
    <div className="bg-background text-on-surface h-screen flex flex-col overflow-hidden admin-page-root">
      <header className="w-full shrink-0 bg-transparent dark:bg-transparent flex items-center justify-between px-edge-margin py-sm h-touch-target-min z-40">
        <div className="flex items-center gap-sm">
          <span
            className="material-symbols-outlined admin-page__brand-icon text-primary dark:text-primary-fixed-dim"
            data-icon="park"
          >
            park
          </span>
          <h1 className="font-headline-lg text-headline-lg tracking-tight admin-page__title">
            GeoGiardini
          </h1>
        </div>
        <div className="flex items-center gap-md">
          <button
            onClick={handleLogout}
            className="w-touch-target-min h-touch-target-min flex items-center justify-center rounded-full hover:bg-surface-container transition-colors active:scale-95 duration-150"
            aria-label="Logout"
          >
            <span
              className="material-symbols-outlined text-on-surface-variant"
              data-icon="logout"
            >
              logout
            </span>
          </button>
        </div>
      </header>
      <div className="admin-page__divider" />

      {statusMessage && (
        <div className={statusBoxClasses} role="status" aria-live="polite">
          {statusMessage}
        </div>
      )}

      {deleteConfirmation && (
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-outline-variant bg-surface-container-low p-5 shadow-2xl">
            <h3 className="font-label-lg text-label-lg mb-3 text-on-surface">
              Conferma cancellazione
            </h3>
            <p className="text-body-md text-on-surface-variant mb-6">
              {deleteConfirmation.type === "giardiniere"
                ? "Sei sicuro di voler eliminare il giardiniere "
                : deleteConfirmation.type === "cliente"
                  ? "Sei sicuro di voler eliminare il cliente "
                  : "Sei sicuro di voler eliminare l'attività "}
              <strong>{deleteConfirmation.label}</strong>? Questa operazione non
              è reversibile.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 h-11 rounded-full bg-error text-on-error font-bold transition hover:bg-error/90"
              >
                Elimina
              </button>
              <button
                type="button"
                onClick={cancelDelete}
                className="flex-1 h-11 rounded-full border border-outline-variant bg-surface text-on-surface font-bold transition hover:bg-surface-container-high"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col max-w-[720px] mx-auto w-full px-edge-margin overflow-hidden py-md">
        <section className="mb-md shrink-0">
          <h2 className="font-headline-md text-headline-md leading-tight admin-page__welcome">
            Benvenuto, Angelo
          </h2>
        </section>

        <div className="bg-surface-container-low rounded-xl p-sm mb-md flex items-center justify-between border border-outline-variant shrink-0">
          <div className="flex items-center gap-md">
            <span
              className="material-symbols-outlined text-primary text-3xl"
              data-icon="schedule"
            >
              schedule
            </span>
            <div>
              <p className="font-label-lg text-label-lg text-on-surface">
                Oggi è il:
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant">
                {now.toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "long",
                  year: "numeric"
                })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              Ora
            </p>
            <p className="font-headline-md text-headline-md text-primary">
              {now.toLocaleTimeString("it-IT", {
                hour: "2-digit",
                minute: "2-digit"
              })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-sm shrink-0 mb-lg">
          <button
            type="button"
            className={actionButtonClasses("giardinieri")}
            onClick={() => handleActionClick("giardinieri")}
          >
            <span
              className="material-symbols-outlined text-2xl"
              data-icon="engineering"
            >
              engineering
            </span>
            <span className="font-label-lg text-label-lg">
              Giardinieri ({giardinieriCount})
            </span>
          </button>
          <button
            type="button"
            className={actionButtonClasses("clienti")}
            onClick={() => handleActionClick("clienti")}
          >
            <span
              className="material-symbols-outlined text-2xl"
              data-icon="groups"
            >
              groups
            </span>
            <span className="font-label-lg text-label-lg">
              Clienti ({clientiCount})
            </span>
          </button>
          <button
            type="button"
            className={actionButtonClasses("attivita")}
            onClick={() => handleActionClick("attivita")}
          >
            <span
              className="material-symbols-outlined text-2xl"
              data-icon="assignment_turned_in"
            >
              assignment_turned_in
            </span>
            <span className="font-label-lg text-label-lg">Attività</span>
          </button>
          <button
            type="button"
            className={actionButtonClasses("avvisi")}
            onClick={() => handleActionClick("avvisi")}
          >
            <span
              className="material-symbols-outlined text-2xl"
              data-icon="send"
            >
              send
            </span>
            <span className="font-label-lg text-label-lg">Avvisi</span>
          </button>
          <button
            type="button"
            className={actionButtonClasses("appuntamento-singolo")}
            onClick={() => handleActionClick("appuntamento-singolo")}
          >
            <span
              className="material-symbols-outlined text-2xl"
              data-icon="event"
            >
              event
            </span>
            <span className="font-label-lg text-label-lg">
              Appuntamento singolo
            </span>
          </button>
        </div>

        {selectedAction === "giardinieri" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-inverse-surface/20 backdrop-blur-sm p-4 overflow-auto">
            <section
              className="w-full max-w-[720px] h-[calc(100vh-2rem)] flex flex-col rounded-[32px] border border-outline-variant bg-surface-container-low shadow-2xl p-6 overflow-hidden"
              style={{
                backgroundImage: "var(--page-background)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="material-symbols-outlined admin-page__modal-heading-icon text-3xl"
                  data-icon="person_add"
                >
                  person_add
                </span>
                <h3 className="font-label-lg text-xl font-semibold admin-page__modal-heading">
                  {editingGiardiniereId
                    ? "Modifica Giardiniere"
                    : "Nuovo Giardiniere"}
                </h3>
                <button
                  type="button"
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary text-3xl leading-none shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
                  onClick={handleClearGiardiniereForm}
                  aria-label="Nuovo giardiniere"
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">
                    cleaning_services
                  </span>
                </button>
              </div>
              <form
                className="flex flex-col h-full gap-md"
                onSubmit={handleSave}
              >
                <div className="space-y-2">
                  <label className="font-label-lg text-label-lg admin-page__modal-label font-bold block pl-2">
                    Username
                  </label>
                  <input
                    ref={usernameRef}
                    className="w-full h-10 px-4 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm text-black font-bold"
                    placeholder="Es. m.rossi"
                    type="text"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-label-sm text-label-sm admin-page__modal-label font-bold block pl-2">
                    Codice
                  </label>
                  <input
                    className="w-full h-10 px-4 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm text-black font-bold"
                    placeholder="Es. GARD-2024"
                    type="text"
                    value={codice}
                    onChange={(event) => setCodice(event.target.value)}
                  />
                  <div className="mt-2 pl-2 flex items-center gap-2 text-sm font-bold admin-page__modal-label whitespace-nowrap">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={giardiniereAttivo}
                        onChange={(event) =>
                          setGiardiniereAttivo(event.target.checked)
                        }
                      />
                      {`Giardiniere ${giardiniereAttivo ? "Attivo" : "Non attivo"}`}
                    </label>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="mb-1">
                    <p className="pl-2 font-label-lg text-label-lg admin-page__modal-label italic font-bold">
                      Giardinieri registrati :{" "}
                      <span className="font-bold">
                        {giardinieriList.length}
                      </span>
                    </p>
                  </div>
                  <div className="h-[18.5rem] overflow-y-auto rounded-2xl border-2 border-outline-variant bg-surface p-2 space-y-2">
                    {giardinieriList.length === 0 ? (
                      <p className="text-sm text-on-surface-variant text-center py-6">
                        Nessun giardiniere presente.
                      </p>
                    ) : (
                      giardinieriList.map((giardiniere) => {
                        const isInactiveGiardiniere =
                          giardiniere.attivo === 0 ||
                          giardiniere.attivo === "0" ||
                          giardiniere.attivo === false ||
                          giardiniere.attivo === "false" ||
                          giardiniere.attivo == null;

                        return (
                          <div
                            key={giardiniere.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectGiardiniere(giardiniere)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                handleSelectGiardiniere(giardiniere);
                              }
                            }}
                            className={`w-full rounded-xl border p-3 text-left transition ${
                              editingGiardiniereId === giardiniere.id
                                ? "border-primary bg-primary/10"
                                : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className={`font-label-lg text-label-lg truncate ${
                                    isInactiveGiardiniere
                                      ? "text-error line-through decoration-red-500 decoration-2"
                                      : "text-on-surface"
                                  }`}
                                >
                                  {giardiniere.username}
                                </p>
                                <p
                                  className={`text-sm truncate ${
                                    isInactiveGiardiniere
                                      ? "text-error line-through decoration-red-500 decoration-2"
                                      : "text-on-surface-variant"
                                  }`}
                                >
                                  Codice: {giardiniere.codice}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-error/10 text-error hover:bg-error/20 transition-colors"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDeleteConfirmation(
                                    "giardiniere",
                                    giardiniere.id,
                                    giardiniere.username
                                  );
                                }}
                                aria-label={`Elimina ${giardiniere.username}`}
                              >
                                <span className="material-symbols-outlined text-lg">
                                  delete
                                </span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="mt-auto flex flex-col gap-3 pt-4 pb-1">
                  <button
                    className="w-full h-10 bg-primary text-on-primary font-label-sm rounded-full active:opacity-90 transition-all shadow-sm"
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? "Salvataggio..." : "Salva"}
                  </button>
                  <button
                    className="flex w-full h-10 items-center justify-center rounded-full border border-primary text-white font-bold font-label-sm leading-none active:bg-surface-container-high transition-colors"
                    type="button"
                    onClick={handleCloseForm}
                  >
                    Annulla - Esci
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {selectedAction === "clienti" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-inverse-surface/20 backdrop-blur-sm p-4 overflow-auto">
            <section
              className="w-full max-w-[720px] max-h-[calc(100vh-2rem)] flex flex-col rounded-[32px] border border-outline-variant bg-surface-container-low shadow-2xl p-6 overflow-hidden"
              style={{
                backgroundImage: "var(--page-background)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="material-symbols-outlined admin-page__modal-heading-icon text-3xl"
                  data-icon="groups"
                >
                  groups
                </span>
                <h3 className="font-label-lg text-xl font-semibold admin-page__modal-heading">
                  {editingClienteId ? "Modifica Cliente" : "Nuovo Cliente"}
                </h3>
                <button
                  type="button"
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
                  onClick={handleClearClienteForm}
                  aria-label="Nuovo cliente"
                >
                  <span className="material-symbols-outlined text-[22px] leading-none">
                    cleaning_services
                  </span>
                </button>
              </div>
              <form
                className="flex flex-col h-full gap-md"
                onSubmit={handleSaveCliente}
              >
                <div className="space-y-2">
                  <label className="pl-2 font-label-lg text-label-lg admin-page__modal-label font-bold block">
                    Nome Cliente
                  </label>
                  <input
                    ref={nomeClienteRef}
                    className="w-full h-10 px-4 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm text-black font-bold"
                    placeholder="Es. Mario Rossi"
                    type="text"
                    value={nomeCliente}
                    onChange={(event) => setNomeCliente(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="pl-2 font-label-lg text-label-lg admin-page__modal-label font-bold block">
                    Indirizzo
                  </label>
                  <input
                    className="w-full h-10 px-4 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm text-black font-bold"
                    placeholder="Es. Via Roma 1"
                    type="text"
                    value={indirizzoCliente}
                    onChange={(event) =>
                      setIndirizzoCliente(event.target.value)
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="pl-2 font-label-sm text-label-sm admin-page__modal-label font-bold block">
                      Codice
                    </label>
                    <input
                      className="w-full h-10 px-4 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm text-black font-bold"
                      placeholder="Es. CLI-2024"
                      type="text"
                      value={clienteCodice}
                      onChange={(event) => setClienteCodice(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="pl-2 font-label-sm text-label-sm admin-page__modal-label font-bold block">
                      Telefono
                    </label>
                    <input
                      className="w-full h-10 px-4 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm text-black font-bold"
                      placeholder="Es. 345 123 4567"
                      type="text"
                      value={telefonoCliente}
                      onChange={(event) =>
                        setTelefonoCliente(event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-bold admin-page__modal-label mt-2 pl-2">
                  <label className="inline-flex items-center gap-2 text-black">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={clienteAttivo}
                      onChange={(event) =>
                        setClienteAttivo(event.target.checked)
                      }
                    />
                    {clienteAttivo ? "Cliente Attivo" : "Cliente Non attivo"}
                  </label>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="mb-1 flex justify-end pr-2">
                    <p className="text-right font-label-lg text-label-lg admin-page__modal-label italic font-bold">
                      Clienti registrati:{" "}
                      <span className="font-bold">{clientiCount}</span>
                    </p>
                  </div>
                  <div className="h-36 overflow-y-auto rounded-2xl border-2 border-outline-variant bg-surface p-2 space-y-2">
                    {clientiList.length === 0 ? (
                      <p className="text-sm text-on-surface-variant text-center py-6">
                        Nessun cliente presente.
                      </p>
                    ) : (
                      clientiList.map((cliente) => (
                        <div
                          key={cliente.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectCliente(cliente)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectCliente(cliente);
                            }
                          }}
                          className={`w-full rounded-xl border p-0.5 text-left transition ${
                            editingClienteId === cliente.id
                              ? "border-primary bg-primary/10"
                              : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-high"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p
                                className={`font-label-lg text-label-lg truncate ${cliente.attivo ? "text-on-surface" : "text-error line-through decoration-red-500 decoration-2"}`}
                              >
                                {cliente.nome}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-error/10 text-error hover:bg-error/20 transition-colors"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDeleteConfirmation(
                                  "cliente",
                                  cliente.id,
                                  cliente.nome
                                );
                              }}
                              aria-label={`Elimina ${cliente.nome}`}
                            >
                              <span className="material-symbols-outlined text-lg">
                                delete
                              </span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-8 pb-1">
                  <button
                    className="w-full h-10 bg-primary text-on-primary font-label-sm rounded-full active:opacity-90 transition-all shadow-sm"
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? "Salvataggio..." : "Salva"}
                  </button>
                  <button
                    className="w-full h-10 border border-primary text-white font-bold font-label-sm rounded-full active:bg-surface-container-high transition-colors"
                    type="button"
                    onClick={handleCloseForm}
                  >
                    Annulla - Esci
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {selectedAction === "attivita" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-inverse-surface/20 backdrop-blur-sm p-4 overflow-auto">
            <section
              className="w-full max-w-[720px] h-[calc(100vh-3rem)] flex flex-col rounded-[32px] border border-outline-variant bg-surface-container-low shadow-2xl p-6 overflow-hidden"
              style={{
                backgroundImage: "var(--page-background)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="material-symbols-outlined admin-page__modal-heading-icon text-3xl"
                  data-icon="assignment_add"
                >
                  assignment_add
                </span>
                <h3 className="font-label-lg text-xl font-semibold admin-page__modal-heading">
                  {editingAttivitaId ? "Modifica Attività" : "Nuova Attività"}
                </h3>
                <button
                  type="button"
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary text-3xl leading-none shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearAttivitaForm();
                  }}
                  aria-label="Pulisci campi attività"
                >
                  <span className="material-symbols-outlined text-on-primary text-[22px] leading-none">
                    cleaning_services
                  </span>
                </button>
              </div>
              <form
                className="flex flex-col h-full gap-md"
                onSubmit={handleSaveAttivita}
              >
                <div className="space-y-2">
                  <label className="font-label-lg text-label-lg admin-page__modal-label font-bold block pl-2">
                    Descrizione Attività
                  </label>
                  <input
                    className="w-full h-10 px-4 rounded-lg border border-outline-variant bg-surface focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm text-black font-bold"
                    placeholder="Es: Potatura siepi"
                    type="text"
                    value={attivitaDescrizione}
                    onChange={(event) =>
                      setAttivitaDescrizione(event.target.value)
                    }
                  />
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="mb-3 space-y-2">
                    <p className="font-label-lg text-label-lg admin-page__modal-label italic font-bold pl-2">
                      Attività inserite:{" "}
                      <span className="font-bold">{attivitaList.length}</span>
                    </p>
                  </div>
                  <div className="h-[24rem] overflow-y-auto rounded-2xl border-2 border-outline-variant bg-surface p-2 space-y-2">
                    {attivitaList.length === 0 ? (
                      <p className="text-sm text-on-surface-variant text-center py-6">
                        Nessuna attività presente.
                      </p>
                    ) : (
                      attivitaList.map((item) => (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectAttivita(item)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleSelectAttivita(item);
                            }
                          }}
                          className="flex items-center justify-between rounded-xl border border-outline-variant p-2 transition bg-white hover:bg-surface-container-high"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-label-lg text-label-lg truncate text-on-surface">
                              {item.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-error/10 text-error hover:bg-error/20 transition-colors"
                              onClick={(event) => {
                                event.stopPropagation();
                                openDeleteConfirmation(
                                  "attivita",
                                  item.id,
                                  item.description
                                );
                              }}
                              aria-label={`Elimina attività ${item.description}`}
                            >
                              <span className="material-symbols-outlined text-base">
                                delete
                              </span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="-mt-12 flex flex-col gap-3 pt-4 pb-1">
                  <button
                    className="w-full h-10 rounded-full bg-primary text-on-primary shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-sm"
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? "Salvataggio..." : "Salva Attività"}
                  </button>
                  <button
                    className="w-full h-10 border border-primary text-white font-bold font-label-sm rounded-full active:bg-surface-container-high transition-colors"
                    type="button"
                    onClick={handleCloseForm}
                  >
                    Annulla - Esci
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {selectedAction === "avvisi" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-inverse-surface/20 backdrop-blur-sm p-4 overflow-auto">
            <section
              className="w-full max-w-[720px] max-h-[calc(100vh-2rem)] flex flex-col rounded-[32px] border border-outline-variant bg-surface-container-low shadow-2xl p-6 overflow-auto"
              style={{
                backgroundImage: "var(--page-background)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="material-symbols-outlined admin-page__modal-heading-icon text-3xl"
                  data-icon="send"
                >
                  send
                </span>
                <h3 className="font-label-lg text-xl font-semibold admin-page__modal-heading">
                  Avvisi
                </h3>
                <button
                  type="button"
                  onClick={clearAvvisoForm}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary text-3xl leading-none shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Pulisci modulo avvisi"
                >
                  <span className="material-symbols-outlined text-on-primary text-[22px] leading-none">
                    cleaning_services
                  </span>
                </button>
              </div>
              <form
                className={`flex-1 flex flex-col gap-6 overflow-hidden ${avvisiModalFilter ? "opacity-40 blur-sm pointer-events-none" : ""}`}
                onSubmit={handleSaveAvviso}
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => openAvvisiModal("unread")}
                    className="rounded-2xl border border-outline-variant p-3 text-left transition hover:border-primary min-h-[50px] flex flex-col justify-between"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(248, 113, 113, 1), rgba(185, 28, 28, 0.35))"
                    }}
                  >
                    <p className="font-label-sm text-label-sm font-semibold text-on-surface underline">
                      Da leggere
                    </p>
                    <p className="font-headline-sm text-headline-sm text-on-surface">
                      {unreadAvvisi.length} avvisi
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => openAvvisiModal("read")}
                    className="rounded-2xl border border-outline-variant p-3 text-left transition hover:border-primary min-h-[50px] flex flex-col justify-between"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255, 245, 207, 1), rgba(236, 179, 62, 1))"
                    }}
                  >
                    <p className="font-label-sm text-label-sm font-semibold text-on-surface underline">
                      Confermati
                    </p>
                    <p className="font-headline-sm text-headline-sm text-on-surface">
                      {readAvvisi.length} avvisi
                    </p>
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <label className="font-label-sm text-label-md admin-page__modal-label block px-2">
                      Cliente interessato
                    </label>
                    <div className="relative">
                      <select
                        className="w-full h-9 bg-white border border-outline-variant rounded-lg px-3 font-body-sm text-body-sm leading-none focus:border-primary outline-none appearance-none transition-all"
                        value={avvisiClienteId}
                        onChange={(event) =>
                          setAvvisiClienteId(event.target.value)
                        }
                      >
                        <option value="">Seleziona cliente</option>
                        {activeClientiList.map((cliente) => (
                          <option key={cliente.id} value={cliente.id}>
                            {cliente.nome}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-2 pointer-events-none text-on-surface-variant text-sm">
                        expand_more
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-label-sm text-label-md admin-page__modal-label block px-2">
                      Giardinieri da avvisare
                    </label>
                    <div className="relative">
                      <select
                        className="w-full h-9 bg-white border border-outline-variant rounded-lg px-3 font-body-sm text-body-sm leading-none focus:border-primary outline-none appearance-none transition-all"
                        value=""
                        onChange={(event) => {
                          const selectedId = event.target.value;
                          if (!selectedId) return;
                          setAvvisiGiardinieriIds((current) =>
                            current.includes(selectedId)
                              ? current
                              : [...current, selectedId]
                          );
                        }}
                      >
                        <option value="">
                          Seleziona giardiniere (o invia a tutti)
                        </option>
                        {activeGiardinieriList.map((giardiniere) => (
                          <option key={giardiniere.id} value={giardiniere.id}>
                            {giardiniere.username}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-2 pointer-events-none text-on-surface-variant text-sm">
                        expand_more
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 rounded-lg border border-outline-variant bg-surface p-3 min-h-[56px]">
                      {avvisiGiardinieriIds.length === 0 ? (
                        <p className="text-sm text-on-surface-variant">
                          Nessun destinatario selezionato: invio a tutti i
                          giardinieri attivi.
                        </p>
                      ) : (
                        avvisiGiardinieriIds.map((id) => {
                          const giardiniere = giardinieriList.find(
                            (item) => item.id === id
                          );
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => toggleAvvisiGiardiniere(id)}
                              className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20"
                            >
                              {giardiniere?.username || id}
                              <span className="material-symbols-outlined text-[14px]">
                                close
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="font-label-sm text-label-md admin-page__modal-label block px-2">
                      Messaggio per il Giardiniere
                    </label>
                    <textarea
                      className="w-full min-h-[88px] resize-none bg-white border border-outline-variant rounded-lg px-3 py-2 font-body-sm text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      value={avvisiMessage}
                      onChange={(event) => setAvvisiMessage(event.target.value)}
                      placeholder="Scrivi qui il testo dell'avviso..."
                    />
                  </div>
                </div>
                <div className="-mt-6 flex flex-col gap-3 pt-4 pb-1">
                  <button
                    className="w-full h-10 rounded-full bg-primary text-on-primary shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-sm"
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      "Invio in corso..."
                    ) : (
                      <span className="text-white">
                        {"Invia\u00A0\u00A0\u00A0Avviso"}
                      </span>
                    )}
                  </button>
                  <button
                    className="w-full h-10 border border-primary text-white font-bold font-label-sm rounded-full active:bg-surface-container-high transition-colors"
                    type="button"
                    onClick={handleCloseForm}
                  >
                    Annulla - Esci
                  </button>
                </div>
              </form>

              {avvisiModalFilter && (
                <>
                  <div className="fixed inset-0 bg-black/50 z-10" />
                  <div className="absolute inset-x-0 top-[120px] bottom-0 z-20 w-full overflow-auto">
                    <div
                      className="h-[calc(100%-60px)] w-[calc(100%-20px)] mx-auto rounded-3xl border border-outline-variant bg-primary p-4 shadow-2xl overflow-auto"
                      style={{
                        backgroundImage: "var(--page-background)",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat"
                      }}
                    >
                      <div className="flex flex-col gap-3 pb-3 pt-4">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-headline-sm text-headline-sm font-bold text-white">
                            {avvisiModalFilter === "unread"
                              ? "Avvisi da leggere"
                              : "Avvisi confermati"}
                          </h4>
                          <button
                            type="button"
                            onClick={closeAvvisiModal}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface transition hover:bg-surface-container-high"
                            aria-label="Chiudi avvisi"
                          >
                            <span className="material-symbols-outlined">
                              close
                            </span>
                          </button>
                        </div>
                        <div className="mt-4 rounded-3xl border border-outline-variant bg-surface-container-high px-4 py-3 shadow-sm">
                          <div className="flex flex-wrap gap-2">
                            {[
                              {
                                key: "today",
                                label: "Oggi",
                                display: "today",
                                isIcon: true
                              },
                              {
                                key: "week",
                                label: "Settimana",
                                display: "7",
                                isIcon: false
                              },
                              {
                                key: "month",
                                label: "Mese",
                                display: "15",
                                isIcon: false
                              },
                              {
                                key: "all",
                                label: "Tutti",
                                display: "31",
                                isIcon: false
                              }
                            ].map((tab) => (
                              <button
                                key={tab.key}
                                type="button"
                                onClick={() =>
                                  setAvvisiTimeFilter(
                                    tab.key as
                                      | "today"
                                      | "week"
                                      | "month"
                                      | "all"
                                  )
                                }
                                aria-label={tab.label}
                                title={tab.label}
                                className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                                  avvisiTimeFilter === tab.key
                                    ? "border-primary bg-primary text-on-primary"
                                    : "border-outline-variant bg-surface-container-high text-on-surface-variant hover:border-primary hover:text-on-surface"
                                }`}
                              >
                                {tab.isIcon ? (
                                  <span className="material-symbols-outlined text-base align-middle">
                                    {tab.display}
                                  </span>
                                ) : (
                                  <span className="text-base font-semibold">
                                    {tab.display}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div className="rounded-3xl border border-outline-variant bg-surface-container-low overflow-hidden">
                          <div className="grid grid-cols-[120px_minmax(0,1.1fr)_minmax(0,0.9fr)] gap-3 border-b border-outline-variant bg-surface-container-low px-2 py-2 text-xs text-on-surface-variant">
                            <span className="font-semibold text-on-surface pl-6">
                              Data
                            </span>
                            <span className="font-semibold text-on-surface">
                              Cliente
                            </span>
                            <span className="font-semibold text-on-surface">
                              Giardiniere
                            </span>
                          </div>
                          <div className="max-h-[122px] overflow-y-auto pr-2">
                            {filteredAvvisiByTime.length === 0 ? (
                              <p className="p-4 text-sm text-on-surface-variant">
                                Nessun avviso in questa categoria/periodo.
                              </p>
                            ) : (
                              <div className="space-y-1 px-2 py-2">
                                {filteredAvvisiByTime.map((avviso) => {
                                  const isClientNotification =
                                    /^Nuovo (?:appuntamento|avviso) per\s*/i.test(
                                      avviso.title
                                    );
                                  const titleValue = isClientNotification
                                    ? avviso.title
                                        .replace(
                                          /^Nuovo (?:appuntamento|avviso) per\s*/i,
                                          ""
                                        )
                                        .trim()
                                    : "";
                                  const clientFromMessageMatch =
                                    avviso.message?.match(
                                      /^Cliente\s*:\s*(.+)$/im
                                    );
                                  const messageClienteName =
                                    clientFromMessageMatch?.[1]?.trim();
                                  const createdAt = new Date(avviso.created_at);
                                  const dateOnly =
                                    createdAt.toLocaleDateString("it-IT");
                                  const selected =
                                    selectedAvvisoId === avviso.id;
                                  const clienteName =
                                    avviso.cliente_nome ||
                                    messageClienteName ||
                                    titleValue;

                                  return (
                                    <button
                                      key={avviso.id}
                                      type="button"
                                      onClick={() =>
                                        setSelectedAvvisoId(avviso.id)
                                      }
                                      className={`grid w-full grid-cols-[28px_80px_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-3 rounded-xl border px-2 py-2 text-left transition ${
                                        selected
                                          ? "border-primary bg-primary/10 text-on-surface"
                                          : "border-outline-variant bg-surface-container-low hover:border-primary hover:bg-surface-container-high"
                                      }`}
                                    >
                                      <span
                                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] material-symbols-outlined ${/^Nuovo appuntamento(?: per)?\s*/i.test(avviso.title) ? "bg-primary/15 text-primary" : /^Nuovo avviso(?: per)?\s*:/i.test(avviso.title) || /^Nuovo avviso\s*:/i.test(avviso.title) ? "bg-error/15 text-error" : "bg-surface text-on-surface-variant"}`}
                                      >
                                        {/^Nuovo appuntamento(?: per)?\s*/i.test(
                                          avviso.title
                                        )
                                          ? "event"
                                          : /^Nuovo avviso(?: per)?\s*:/i.test(
                                                avviso.title
                                              ) ||
                                              /^Nuovo avviso\s*:/i.test(
                                                avviso.title
                                              )
                                            ? "message"
                                            : "notifications"}
                                      </span>
                                      <span className="text-xs font-semibold text-on-surface">
                                        {dateOnly}
                                      </span>
                                      <span className="truncate text-xs font-semibold text-on-surface pl-0 text-left">
                                        {clienteName || avviso.title}
                                      </span>
                                      <span className="truncate text-xs font-semibold text-on-surface">
                                        {avviso.giardiniere_username ||
                                          avviso.giardiniere_id}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface h-[220px] overflow-y-auto">
                          {selectedAvvisoId ? (
                            (() => {
                              const avviso = filteredAvvisiByTime.find(
                                (item) => item.id === selectedAvvisoId
                              );
                              if (!avviso) return null;
                              const isAppointmentNotification =
                                /^Nuovo appuntamento(?: per)?\s*/i.test(
                                  avviso.title
                                );
                              const isAvvisoNotification =
                                /^(?:Nuovo\s+)?avviso(?:\s+inviato)?(?:\s+per)?\s*:/i.test(
                                  avviso.title
                                ) ||
                                /^(?:Avviso|Notifica(?:\s+inviata)?)\s*:/i.test(
                                  avviso.title
                                );
                              const titleValue =
                                isAppointmentNotification ||
                                isAvvisoNotification
                                  ? avviso.title
                                      .replace(
                                        /^(?:Nuovo\s+)?(?:appuntamento|avviso)(?:\s+inviato)?(?:\s+per)?\s*:?\s*/i,
                                        ""
                                      )
                                      .trim()
                                  : "";
                              const notificationLabel = isAvvisoNotification
                                ? "Avviso inviato :"
                                : "";
                              const rawMessage = avviso.message || "";
                              const clientFromMessageMatch =
                                rawMessage.match(/^Cliente\s*:\s*(.+)$/im);
                              const messageClientName =
                                clientFromMessageMatch?.[1]?.trim();
                              const clienteName =
                                messageClientName ||
                                avviso.cliente_nome ||
                                titleValue;

                              const appointmentMatch = rawMessage.match(
                                /^Hai un nuovo appuntamento il\s*\d{4}-\d{2}-\d{2}:?\s*(.*)$/i
                              );
                              const appointmentActivity = appointmentMatch
                                ? appointmentMatch[1]
                                    .trim()
                                    .replace(/[.。]+$/, "")
                                    .trim()
                                : "";

                              const activityMatch = rawMessage.match(
                                /^Attivit[àa]?\s*(?:da svolgere)?\s*:\s*([\s\S]+)$/im
                              );
                              const activityDetail =
                                appointmentActivity ||
                                activityMatch?.[1]
                                  ?.trim()
                                  .replace(/[.。]+$/, "") ||
                                "";

                              const appointmentDatePattern =
                                /\s*Data Appuntamento\s*:\s*[\d/\-]+\s*/gi;

                              const cleanText = (text: string) =>
                                text
                                  .replace(/^Cliente\s*:\s*.+$/gim, "")
                                  .replace(/^[\s\S]*?Messaggio\s*:\s*/i, "")
                                  .replace(
                                    /^Attivit[àa]?\s*(?:da svolgere)?\s*:\s*/gim,
                                    ""
                                  )
                                  .replace(
                                    /^Hai un nuovo appuntamento il\s*\d{4}-\d{2}-\d{2}:?\s*/i,
                                    ""
                                  )
                                  .replace(appointmentDatePattern, "")
                                  .trim()
                                  .replace(/[.。]+$/, "")
                                  .trim();

                              const cleanedMessage = cleanText(rawMessage);
                              const cleanedTitle = cleanText(
                                avviso.title || ""
                              );

                              const cleanedActivityDetail =
                                cleanText(activityDetail);

                              const notificationText =
                                cleanedMessage || cleanedTitle || "";
                              const shouldShowNotificationText =
                                notificationText &&
                                (notificationText !== cleanedActivityDetail ||
                                  !!notificationLabel);
                              const createdAt = new Date(avviso.created_at);
                              const dateOnly =
                                createdAt.toLocaleDateString("it-IT");
                              const timeOnly =
                                createdAt.toLocaleTimeString("it-IT");

                              return (
                                <>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="inline-flex items-center gap-2">
                                      <span
                                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] material-symbols-outlined ${
                                          isAppointmentNotification
                                            ? "bg-primary/15 text-primary"
                                            : "bg-error/15 text-error"
                                        }`}
                                      >
                                        {isAppointmentNotification
                                          ? "event"
                                          : "message"}
                                      </span>
                                      <p className="text-sm font-semibold text-on-surface-variant">
                                        {isAvvisoNotification
                                          ? "Dettaglio avviso"
                                          : "Dettaglio appuntamento"}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedAvvisoId(null)}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface transition hover:bg-surface-container-high"
                                    >
                                      <span className="material-symbols-outlined text-base">
                                        close
                                      </span>
                                    </button>
                                  </div>
                                  <div className="mt-3 h-px w-full bg-outline-variant" />
                                  <div className="mt-3 space-y-3 text-sm text-on-surface-variant">
                                    <p>
                                      <span className="font-semibold text-on-surface">
                                        Data :
                                      </span>{" "}
                                      <span className="text-on-surface">
                                        {dateOnly}
                                      </span>
                                    </p>
                                    <p>
                                      <span className="font-semibold text-on-surface">
                                        {clienteName ? "Cliente :" : "Titolo :"}
                                      </span>{" "}
                                      <span className="text-on-surface">
                                        {clienteName || avviso.title}
                                      </span>
                                    </p>
                                    <p>
                                      <span className="font-semibold text-on-surface">
                                        Giardiniere incaricato :
                                      </span>{" "}
                                      <span className="text-on-surface">
                                        {avviso.giardiniere_username ||
                                          avviso.giardiniere_id}
                                      </span>
                                    </p>
                                    {shouldShowNotificationText ? (
                                      <p className="text-on-surface">
                                        {notificationLabel ? (
                                          <>
                                            <span className="font-semibold text-on-surface">
                                              {notificationLabel}
                                            </span>{" "}
                                            <span>{notificationText}</span>
                                          </>
                                        ) : (
                                          <span>{notificationText}</span>
                                        )}
                                      </p>
                                    ) : null}
                                    {cleanedActivityDetail ? (
                                      <p>
                                        <span className="font-semibold text-on-surface">
                                          Attività da svolgere :
                                        </span>{" "}
                                        <span className="text-on-surface">
                                          {cleanedActivityDetail}
                                        </span>
                                      </p>
                                    ) : null}
                                  </div>
                                </>
                              );
                            })()
                          ) : (
                            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-on-surface-variant">
                              <p className="font-semibold text-on-surface">
                                Seleziona un avviso per vedere il riepilogo
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {selectedAction === "appuntamento-singolo" && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-inverse-surface/20 backdrop-blur-sm p-0 overflow-auto">
            <section
              className="w-full h-full flex flex-col rounded-none border-none bg-surface-container-low shadow-none p-6 overflow-hidden"
              style={{
                backgroundImage: "var(--page-background)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat"
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="material-symbols-outlined admin-page__modal-heading-icon text-3xl"
                  data-icon="event"
                >
                  event
                </span>
                <h3 className="font-label-lg text-xl font-semibold admin-page__modal-heading">
                  Appuntamento singolo
                </h3>
                <button
                  type="button"
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary text-3xl leading-none shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    clearAppuntamentoForm();
                  }}
                  aria-label="Pulisci campi appuntamento"
                >
                  <span className="material-symbols-outlined text-on-primary text-[22px] leading-none">
                    cleaning_services
                  </span>
                </button>
              </div>
              <form
                className="flex-1 flex flex-col gap-md overflow-hidden"
                onSubmit={handleSaveAppuntamento}
              >
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <label className="font-label-sm text-label-md text-on-surface block px-2">
                      Data
                    </label>
                    <div className="relative">
                      <input
                        className="w-full h-9 bg-white border border-outline-variant rounded-lg px-3 py-1 font-body-sm text-body-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                        type="date"
                        value={appuntamentoData}
                        onChange={(event) =>
                          setAppuntamentoData(event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-label-sm text-label-md text-on-surface block px-2">
                      Cliente
                    </label>
                    <div className="relative">
                      <select
                        className="w-full h-9 bg-white border border-outline-variant rounded-lg px-3 font-body-sm text-body-sm leading-none focus:border-primary outline-none appearance-none transition-all"
                        value={appuntamentoClienteId}
                        onChange={(event) =>
                          setAppuntamentoClienteId(event.target.value)
                        }
                      >
                        <option value="">Seleziona cliente...</option>
                        {activeClientiList.map((cliente) => (
                          <option key={cliente.id} value={cliente.id}>
                            {cliente.nome}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-2 pointer-events-none text-on-surface-variant text-sm">
                        expand_more
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-label-sm text-label-md text-on-surface block px-2">
                    Scegli giardiniere
                  </label>
                  <div className="space-y-1">
                    <div className="relative">
                      <select
                        className="w-full h-9 bg-white border border-outline-variant rounded-lg px-3 font-body-sm text-body-sm leading-none focus:border-primary outline-none appearance-none transition-all"
                        value=""
                        onChange={(event) => {
                          const selectedId = event.target.value;
                          if (!selectedId) return;
                          setAppuntamentoGiardinieriIds((current) =>
                            current.includes(selectedId)
                              ? current
                              : [...current, selectedId]
                          );
                        }}
                      >
                        <option value="">Seleziona Giardiniere...</option>
                        {activeGiardinieriList.map((giardiniere) => (
                          <option key={giardiniere.id} value={giardiniere.id}>
                            {giardiniere.username}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-2 pointer-events-none text-on-surface-variant text-sm">
                        expand_more
                      </span>
                    </div>
                    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-2 min-h-[56px]">
                      {appuntamentoGiardinieriIds.length === 0 ? (
                        <p className="text-sm text-on-surface-variant">
                          Nessun giardiniere selezionato.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {appuntamentoGiardinieriIds.map((giardiniereId) => {
                            const giardiniere = giardinieriList.find(
                              (item) => item.id === giardiniereId
                            );
                            return (
                              <span
                                key={giardiniereId}
                                className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-2 py-1 text-sm text-on-surface"
                              >
                                <span>
                                  {giardiniere?.username || "Sconosciuto"}
                                </span>
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-error/10 text-error transition hover:bg-error/20"
                                  onClick={() =>
                                    setAppuntamentoGiardinieriIds((current) =>
                                      current.filter(
                                        (item) => item !== giardiniereId
                                      )
                                    )
                                  }
                                  aria-label={`Rimuovi ${giardiniere?.username || "tecnico"}`}
                                >
                                  <span className="material-symbols-outlined text-[16px]">
                                    close
                                  </span>
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="font-label-sm text-label-md text-on-surface block px-1">
                    Scegli attività
                  </label>
                  <div className="space-y-1">
                    <div className="relative">
                      <select
                        className="w-full h-9 bg-white border border-outline-variant rounded-lg px-3 font-body-sm text-body-sm leading-none focus:border-primary outline-none appearance-none transition-all"
                        value=""
                        onChange={(event) => {
                          const selectedActivity = event.target.value;
                          if (!selectedActivity) return;
                          setAppuntamentoAttivita((current) =>
                            current.includes(selectedActivity)
                              ? current
                              : [...current, selectedActivity]
                          );
                        }}
                      >
                        <option value="">Seleziona attività...</option>
                        {attivitaList.map((activity) => (
                          <option
                            key={activity.id}
                            value={activity.description}
                          >
                            {activity.description}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-2 pointer-events-none text-on-surface-variant text-sm">
                        expand_more
                      </span>
                    </div>
                    <div className="rounded-lg border border-outline-variant bg-surface-container-low p-2 min-h-[72px] max-h-[104px] overflow-y-auto">
                      {appuntamentoAttivita.length === 0 ? (
                        <p className="text-sm text-on-surface-variant">
                          Nessuna attività selezionata.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {appuntamentoAttivita.map((activity) => (
                            <span
                              key={activity}
                              className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-2 py-1 text-sm text-on-surface"
                            >
                              <span>{activity}</span>
                              <button
                                type="button"
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-error/10 text-error transition hover:bg-error/20"
                                onClick={() =>
                                  setAppuntamentoAttivita((current) =>
                                    current.filter((item) => item !== activity)
                                  )
                                }
                                aria-label={`Rimuovi attività ${activity}`}
                              >
                                <span className="material-symbols-outlined text-[16px]">
                                  close
                                </span>
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-xs">
                  <label className="font-label-sm text-label-md text-on-surface block px-1">
                    Note per il giardiniere
                  </label>
                  <textarea
                    className="h-20 w-full bg-surface-container-low border border-outline-variant rounded-xl p-md font-body-md text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none transition-all"
                    placeholder="Dettagli aggiuntivi o istruzioni speciali..."
                    value={appuntamentoNote}
                    onChange={(event) =>
                      setAppuntamentoNote(event.target.value)
                    }
                  />
                </div>

                <div className="-mt-4 flex flex-col gap-3 pt-4 pb-1">
                  <button
                    className="w-full h-10 rounded-full bg-primary text-on-primary shadow-lg active:scale-95 transition-transform"
                    type="submit"
                    disabled={isSaving}
                  >
                    {isSaving ? "Salvataggio..." : "Salva Appuntamento"}
                  </button>
                  <button
                    className="w-full h-10 border border-primary text-white font-bold font-label-sm rounded-full active:bg-surface-container-high transition-colors"
                    type="button"
                    onClick={handleCloseForm}
                  >
                    Annulla - Esci
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminPage;
