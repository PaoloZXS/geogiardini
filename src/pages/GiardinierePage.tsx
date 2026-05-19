import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

type GiardinierePageProps = {
  onLogout: () => void;
};

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

type NotificationItem = {
  id: string;
  titolo?: string;
  title: string;
  message: string;
  read: number;
  created_at: string;
  appuntamento_id?: string;
  cliente_nome?: string;
  executionId?: string;
  executionDate?: string;
  executionNotes?: string;
  executionPhotoUrls?: string[];
};

type ExecutionHistoryItem = {
  id: string;
  notifica_id: string;
  giardiniere_id: string;
  execution_date?: string;
  notes: string;
  photo_paths: string;
  photoUrls: string[];
  created_at: string;
  updated_at: string;
  title?: string;
  message?: string;
  notification_created_at?: string;
};

type AppointmentItem = {
  id: string;
  data: string;
  clienteNome: string;
  note: string;
  attivita: string[];
  giardinieri: Array<{ id: string; username: string }>;
};

type NotificationFilterOption = "all" | "avvisi" | "appuntamenti";

function GiardinierePage({ onLogout }: GiardinierePageProps) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pushStatus, setPushStatus] = useState<
    "unknown" | "unsupported" | "denied" | "granted" | "subscribed"
  >("unknown");
  const [pushError, setPushError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [serviceWorkerControlled, setServiceWorkerControlled] = useState(false);
  const [inAppPopup, setInAppPopup] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [showUnreadNotifications, setShowUnreadNotifications] = useState(false);
  const [showCompletedAppointments, setShowCompletedAppointments] =
    useState(false);
  const [showExecutionHistory, setShowExecutionHistory] = useState(false);
  const [unreadNotificationFilter, setUnreadNotificationFilter] =
    useState<NotificationFilterOption>("all");
  const anyPanelOpen =
    showUnreadNotifications ||
    showCompletedAppointments ||
    showExecutionHistory;
  const [readNotificationFilter, setReadNotificationFilter] =
    useState<NotificationFilterOption>("all");
  const [
    selectedNotificationForExecution,
    setSelectedNotificationForExecution
  ] = useState<NotificationItem | null>(null);
  const [executionDate, setExecutionDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [executionNotes, setExecutionNotes] = useState<string>("");
  const [executionPhotos, setExecutionPhotos] = useState<File[]>([]);
  const [executionPhotoPreviews, setExecutionPhotoPreviews] = useState<
    string[]
  >([]);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(
    null
  );
  const [executionHistory, setExecutionHistory] = useState<
    ExecutionHistoryItem[]
  >([]);
  const unreadSectionRef = useRef<HTMLDivElement | null>(null);
  const completedSectionRef = useRef<HTMLDivElement | null>(null);
  const executionHistoryRef = useRef<HTMLDivElement | null>(null);
  const previousUnreadIdsRef = useRef<Set<string>>(new Set());
  const popupTimeoutRef = useRef<number | null>(null);

  const showInAppPopup = (title: string, body: string) => {
    setInAppPopup({ title, body });
    if (popupTimeoutRef.current) {
      window.clearTimeout(popupTimeoutRef.current);
    }
    popupTimeoutRef.current = window.setTimeout(() => {
      setInAppPopup(null);
      popupTimeoutRef.current = null;
    }, 5000);
  };

  const updateAppBadge = (unreadCount: number) => {
    if (typeof window === "undefined") return;
    const nav = navigator as any;

    if (typeof nav.setAppBadge === "function") {
      if (unreadCount > 0) {
        void nav.setAppBadge(unreadCount).catch((error: unknown) => {
          console.error("App badge set failed", error);
        });
        return;
      }

      if (typeof nav.clearAppBadge === "function") {
        void nav.clearAppBadge().catch((error: unknown) => {
          console.error("App badge clear failed", error);
        });
      }
    }
  };

  const registerPushSubscription = async (userId: string) => {
    setPushError(null);
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setPushStatus("unsupported");
      setNotificationPermission(
        typeof window !== "undefined" ? Notification.permission : "default"
      );
      setServiceWorkerControlled(
        typeof window !== "undefined" && "serviceWorker" in navigator
          ? !!navigator.serviceWorker.controller
          : false
      );
      setPushError("Il browser non supporta le notifiche push.");
      return;
    }

    setNotificationPermission(Notification.permission);
    setServiceWorkerControlled(!!navigator.serviceWorker.controller);

    if (Notification.permission === "denied") {
      setPushStatus("denied");
      setPushError("Notifiche bloccate nelle impostazioni del browser.");
      return;
    }

    setPushStatus("granted");
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
        throw new Error(
          "Unable to activate service worker for push notifications."
        );
      }

      let subscription = await registration.pushManager.getSubscription();

      const publicKeyResponse = await fetch("/api/push-public-key");
      const publicKeyData = await publicKeyResponse.json().catch(() => null);
      if (!publicKeyResponse.ok) {
        const serverMessage =
          publicKeyData?.message ||
          `Errore ${publicKeyResponse.status} recuperando la chiave push dal server.`;
        setPushError(serverMessage);
        setPushStatus("unknown");
        return;
      }

      const serverPublicKey = publicKeyData?.publicKey || "";
      const applicationServerKey = urlBase64ToUint8Array(serverPublicKey);

      if (!applicationServerKey.length) {
        const message = "Chiave pubblica push non valida dal server.";
        console.error(message);
        setPushError(message);
        setPushStatus("unknown");
        return;
      }

      const storedVapidKey = window.localStorage.getItem("pushVapidPublicKey");
      if (
        subscription &&
        storedVapidKey &&
        storedVapidKey !== serverPublicKey
      ) {
        try {
          await subscription.unsubscribe();
        } catch (unsubscribeError) {
          console.warn(
            "Impossibile rimuovere la vecchia push subscription",
            unsubscribeError
          );
        }
        subscription = null;
      }

      if (!subscription) {
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          setNotificationPermission(permission);
          if (permission !== "granted") {
            setPushStatus("denied");
            setPushError("Permessi notifiche non concessi.");
            return;
          }
        }

        if (Notification.permission !== "granted") {
          setPushStatus("denied");
          setPushError("Permessi notifiche non concessi.");
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      const subscriptionPayload =
        typeof subscription?.toJSON === "function"
          ? subscription.toJSON()
          : subscription;

      const response = await fetch("/api/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          giardiniereId: userId,
          subscription: subscriptionPayload
        })
      });

      if (!response.ok) {
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        const rawText = await response.text().catch(() => "");
        const message =
          body?.message ||
          (rawText
            ? `Errore ${response.status} durante la registrazione push: ${rawText.slice(0, 180)}`
            : null) ||
          `Errore ${response.status} durante la registrazione push.`;
        console.error("Push subscription save failed", response.status, body);
        setPushError(message);
        setPushStatus("unknown");
        return;
      }

      setPushStatus("subscribed");
      setPushError(null);
      window.localStorage.setItem("pushVapidPublicKey", serverPublicKey);
      setServiceWorkerControlled(!!navigator.serviceWorker.controller);
    } catch (error) {
      console.error("Push registration failed", error);
      console.error("Push registration failed", error);
      setPushError(
        error instanceof Error ? error.message : "Registrazione push fallita."
      );
      setPushStatus("denied");
      setServiceWorkerControlled(!!navigator.serviceWorker.controller);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedId = window.localStorage.getItem("userId");
    const storedName = window.localStorage.getItem("loginUsername") || "";
    const storedRole = window.localStorage.getItem("loginRole");

    if (!storedId || storedRole !== "giardiniere") {
      navigate("/geologin", { replace: true });
      return;
    }

    setUserId(storedId);
    setUserName(storedName);
  }, [navigate]);

  useEffect(() => {
    if (!userId) return;

    registerPushSubscription(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    const refreshPushSubscription = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      if ("Notification" in window && Notification.permission === "granted") {
        void registerPushSubscription(userId);
      }
    };

    const refreshNotifications = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      setRefreshKey((current) => current + 1);
    };

    window.addEventListener("focus", refreshPushSubscription);
    document.addEventListener("visibilitychange", refreshPushSubscription);
    window.addEventListener("focus", refreshNotifications);
    document.addEventListener("visibilitychange", refreshNotifications);

    return () => {
      window.removeEventListener("focus", refreshPushSubscription);
      document.removeEventListener("visibilitychange", refreshPushSubscription);
      window.removeEventListener("focus", refreshNotifications);
      document.removeEventListener("visibilitychange", refreshNotifications);
    };
  }, [userId]);

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) {
        window.clearTimeout(popupTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    const handleStorageChange = () => {
      const lastPush = window.localStorage.getItem("pushNotificationReceived");
      if (lastPush) {
        setRefreshKey((current) => current + 1);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [userId]);

  const openExecutionModal = (notification: NotificationItem) => {
    setSelectedNotificationForExecution(notification);
    setExecutionNotes(notification.executionNotes ?? "");
    setExecutionPhotos([]);
    setExecutionPhotoPreviews(notification.executionPhotoUrls ?? []);
    setExecutionDate(
      notification.executionDate || new Date().toISOString().slice(0, 10)
    );
  };

  const closeExecutionModal = () => {
    setSelectedNotificationForExecution(null);
    setExecutionNotes("");
    setExecutionPhotos([]);
    setExecutionPhotoPreviews([]);
  };

  const handleDeletePreview = () => {
    if (!selectedPreviewUrl) return;

    setExecutionPhotoPreviews((currentPreviewUrls) => {
      const indexToRemove = currentPreviewUrls.indexOf(selectedPreviewUrl);
      if (indexToRemove < 0) return currentPreviewUrls;

      setExecutionPhotos((currentPhotos) =>
        currentPhotos.filter((_, index) => index !== indexToRemove)
      );
      return currentPreviewUrls.filter((_, index) => index !== indexToRemove);
    });
    setSelectedPreviewUrl(null);
  };

  const handleExecutionPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(event.target.files || []);
    if (newFiles.length === 0) return;

    setExecutionPhotos((currentPhotos) => {
      const combined = [...currentPhotos, ...newFiles];
      return combined.slice(0, 8);
    });

    setExecutionPhotoPreviews((currentPreviews) => {
      const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
      const combined = [...currentPreviews, ...newPreviews];
      return combined.slice(0, 8);
    });

    if (event.target.value) {
      event.target.value = "";
    }
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          const base64 = result.split(",")[1] ?? "";
          resolve(base64);
        } else {
          reject(new Error("FileReader result invalid"));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleSaveExecution = async () => {
    if (!selectedNotificationForExecution) return;

    try {
      const filesPayload = await Promise.all(
        executionPhotos.map(async (file) => ({
          name: file.name,
          type: file.type || "application/octet-stream",
          base64: await fileToBase64(file)
        }))
      );

      const response = await fetch("/api/dropbox-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId: selectedNotificationForExecution.id,
          executionDate,
          executionNotes,
          files: filesPayload
        })
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message || "Errore upload Dropbox.");
      }

      closeExecutionModal();
    } catch (error) {
      console.error("Esecuzione save failed", error);
      setError(
        error instanceof Error
          ? error.message
          : "Errore durante il salvataggio dell'esecuzione."
      );
    }
  };

  useEffect(() => {
    if (!userId) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") {
        setRefreshKey((current) => current + 1);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      setLoading(true);
      setError("");

      try {
        const [notificheRes, appointmentsRes, executionsRes] =
          await Promise.all([
            fetch(`/api/notifiche?giardiniereId=${encodeURIComponent(userId)}`),
            fetch(
              `/api/appuntamenti?giardiniereId=${encodeURIComponent(userId)}`
            ),
            fetch(
              `/api/notifiche-esecuzioni?giardiniereId=${encodeURIComponent(userId)}`
            )
          ]);

        const notificheData = await notificheRes.json().catch(() => null);
        const appointmentsData = await appointmentsRes.json().catch(() => null);
        const executionsData = await executionsRes.json().catch(() => null);

        if (!notificheRes.ok) {
          throw new Error(
            notificheData?.message || "Errore caricamento notifiche."
          );
        }
        if (!appointmentsRes.ok) {
          throw new Error(
            appointmentsData?.message || "Errore caricamento appuntamenti."
          );
        }
        if (!executionsRes.ok) {
          throw new Error(
            executionsData?.message || "Errore caricamento storico esecuzioni."
          );
        }

        const parsePhotoUrls = (value: unknown) => {
          if (typeof value === "string") {
            try {
              const parsed = JSON.parse(value);
              return Array.isArray(parsed)
                ? parsed.filter((item) => typeof item === "string")
                : [];
            } catch {
              return [];
            }
          }
          if (Array.isArray(value)) {
            return value.filter((item) => typeof item === "string");
          }
          return [];
        };

        const nextNotifications = Array.isArray(notificheData?.notifiche)
          ? notificheData.notifiche.map((item: any) => ({
              ...item,
              executionId: item.execution_id,
              executionDate: item.execution_date,
              executionNotes: item.execution_notes,
              executionPhotoUrls: parsePhotoUrls(item.execution_photo_paths)
            }))
          : [];

        const nextUnreadIds = new Set<string>(
          nextNotifications
            .filter((item: NotificationItem) => Number(item?.read) === 0)
            .map((item: NotificationItem) => item?.id)
            .filter((id: string): id is string => Boolean(id))
        );

        if (previousUnreadIdsRef.current.size > 0) {
          const newlyArrived = nextNotifications.filter(
            (item: NotificationItem) =>
              Number(item?.read) === 0 &&
              item?.id &&
              !previousUnreadIdsRef.current.has(item.id)
          );

          if (
            newlyArrived.length > 0 &&
            typeof window !== "undefined" &&
            "Notification" in window
          ) {
            const first = newlyArrived[0];
            showInAppPopup(
              first.title || "Nuovo avviso",
              first.message || "Hai ricevuto un nuovo avviso."
            );
            if (Notification.permission === "granted") {
              try {
                const registration = await navigator.serviceWorker.ready;
                if (registration) {
                  await registration.showNotification(
                    first.title || "Nuovo avviso",
                    {
                      body: first.message || "",
                      icon: "/leaf-512.png"
                    }
                  );
                } else {
                  new Notification(first.title || "Nuovo avviso", {
                    body: first.message || "",
                    icon: "/leaf-512.png"
                  });
                }
              } catch (notificationError) {
                console.error("Browser notification failed", notificationError);
              }
            }
          }
        }

        previousUnreadIdsRef.current = nextUnreadIds;
        updateAppBadge(nextUnreadIds.size);
        setNotifications(nextNotifications);
        setAppointments(
          Array.isArray(appointmentsData?.appointments)
            ? appointmentsData.appointments
            : []
        );
        setExecutionHistory(
          Array.isArray(executionsData?.executions)
            ? executionsData.executions.map((item: any) => ({
                ...item,
                photoUrls:
                  typeof item.photo_paths === "string"
                    ? (() => {
                        try {
                          const parsed = JSON.parse(item.photo_paths);
                          return Array.isArray(parsed)
                            ? parsed.filter(
                                (photo: unknown) => typeof photo === "string"
                              )
                            : [];
                        } catch {
                          return [];
                        }
                      })()
                    : Array.isArray(item.photo_paths)
                      ? item.photo_paths.filter(
                          (photo: unknown) => typeof photo === "string"
                        )
                      : []
              }))
            : []
        );
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Errore durante il caricamento."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, refreshKey]);

  const markNotificationRead = async (id: string) => {
    try {
      let response = await fetch(`/api/notifiche/${id}/read`, {
        method: "PUT"
      });
      if (response.status === 405 || response.status === 404) {
        response = await fetch(`/api/notifiche/${id}/read`, {
          method: "POST"
        });
      }
      if (response.status === 405 || response.status === 404) {
        response = await fetch(
          `/api/notifiche-read?id=${encodeURIComponent(id)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
          }
        );
      }
      if (!response.ok) {
        const responseText = await response.text().catch(() => "");
        let data: any = null;
        if (responseText) {
          try {
            data = JSON.parse(responseText);
          } catch {
            data = null;
          }
        }
        throw new Error(
          data?.message ||
            `Errore segnare notifica come letta (HTTP ${response.status})${
              responseText ? `: ${responseText.slice(0, 180)}` : ""
            }`
        );
      }
      setRefreshKey((current) => current + 1);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Errore durante l'aggiornamento."
      );
    }
  };

  const handleLogout = () => {
    updateAppBadge(0);
    onLogout();
  };

  const formatNotification = (notification: NotificationItem) => {
    const appointmentTitleMatch = notification.title.match(
      /^Nuovo appuntamento per\s*(.+)$/i
    );
    const appointmentAltTitleMatch = notification.title.match(
      /^Appuntamento da\s*:$/i
    );
    const message = notification.message || "";
    const appointmentMessageMatch =
      /^Cliente\s*:\s*(.+)$/m.test(message) &&
      /(?:Attività da svolgere|Attivita' da svolgere|Attivita'\s*:\s*|Attività\s*:\s*)(.+)/im.test(
        message
      );
    const appointmentId = notification.appuntamento_id?.toString?.().trim();

    const appointmentDateMatch =
      message.match(/Data Appuntamento\s*:\s*(.+)$/im) ||
      message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const appointmentDate = appointmentDateMatch?.[1]
      ? (() => {
          const parsed = new Date(appointmentDateMatch[1].trim());
          return !Number.isNaN(parsed.getTime())
            ? parsed.toLocaleDateString("it-IT")
            : appointmentDateMatch[1].trim();
        })()
      : null;

    if (
      appointmentTitleMatch ||
      appointmentAltTitleMatch ||
      appointmentMessageMatch ||
      Boolean(appointmentId)
    ) {
      const clienteName = appointmentTitleMatch
        ? appointmentTitleMatch[1].trim()
        : "";
      const lines: string[] = [];

      if (clienteName) {
        lines.push(`Cliente : ${clienteName}`);
      } else {
        const clientMatch = message.match(/^Cliente\s*:\s*(.+)$/m);
        if (clientMatch?.[1]) {
          lines.push(`Cliente : ${clientMatch[1].trim()}`);
        } else if (notification.cliente_nome) {
          lines.push(`Cliente : ${notification.cliente_nome}`);
        }
      }

      const activityMatch = message.match(
        /^(?:Attività da svolgere|Attivita' da svolgere|Attivita'\s*:\s*|Attività\s*:\s*)(.+)$/im
      );
      if (activityMatch?.[1]) {
        lines.push(`Attività da svolgere : ${activityMatch[1].trim()}`);
      } else {
        const activityLineMatch = message.match(
          /(?:Hai un nuovo appuntamento il\s*\d{4}-\d{2}-\d{2}:?\s*)(.+)$/i
        );
        if (activityLineMatch?.[1]) {
          lines.push(
            `Attività da svolgere : ${activityLineMatch[1].trim().replace(/[.。]+$/, "")}`
          );
        }
      }

      return {
        title: `Nuovo Appuntamento :${appointmentDate ? ` ${appointmentDate}` : ""}`,
        lines
      };
    }

    const avvisoTitleMatch = notification.title.match(/^Nuovo avviso\s*:/i);
    if (avvisoTitleMatch) {
      const message = notification.message || "";
      const lines: string[] = [];
      const clientMatch = message.match(/^Cliente\s*:\s*(.+)$/m);
      const msgMatch = message.match(/^Messaggio\s*:\s*(.+)$/m);
      if (clientMatch?.[1]) {
        lines.push(`Cliente : ${clientMatch[1].trim()}`);
      }
      if (msgMatch?.[1]) {
        lines.push(`Avviso : ${msgMatch[1].trim()}`);
      }
      const avvisoDateMatch =
        message.match(/Data avviso\s*:\s*(.+)$/im) || notification.created_at
          ? [
              null,
              new Date(notification.created_at).toLocaleDateString("it-IT")
            ]
          : null;
      const avvisoDate = avvisoDateMatch?.[1] ?? null;
      return {
        title: `${notification.title}${avvisoDate ? ` ${avvisoDate}` : ""}`,
        lines
      };
    }

    return {
      title: notification.title,
      lines: notification.message ? notification.message.split("\n") : []
    };
  };

  const getNotificationCardClasses = (formattedTitle: string) => {
    if (/^Nuovo Appuntamento/i.test(formattedTitle)) {
      return "border-emerald-200 bg-emerald-100";
    }
    if (/^Nuovo Avviso/i.test(formattedTitle)) {
      return "border-rose-200 bg-rose-100";
    }
    return "border-outline-variant bg-surface";
  };

  const getFilterButtonClasses = (
    option: NotificationFilterOption,
    active: boolean
  ) => {
    if (!active) {
      return "rounded-full border border-outline-variant bg-surface text-on-surface px-3 py-1.5 text-sm transition";
    }

    if (option === "avvisi") {
      return "rounded-full border border-rose-200 bg-rose-100 text-rose-900 px-3 py-1.5 text-sm transition";
    }
    if (option === "appuntamenti") {
      return "rounded-full border border-emerald-200 bg-emerald-100 text-emerald-900 px-3 py-1.5 text-sm transition";
    }
    return "rounded-full border border-primary bg-primary/10 text-primary px-3 py-1.5 text-sm transition";
  };

  const getNotificationType = (notification: NotificationItem) => {
    const title = formatNotification(notification).title;
    if (/^Nuovo Appuntamento/i.test(title)) {
      return "appuntamenti" as const;
    }
    if (/^Nuovo Avviso/i.test(title)) {
      return "avvisi" as const;
    }
    return "all" as const;
  };

  const matchesNotificationFilter = (
    notification: NotificationItem,
    filter: NotificationFilterOption
  ) => {
    if (filter === "all") return true;
    return getNotificationType(notification) === filter;
  };

  const unreadNotifications = notifications.filter((item) => item.read === 0);
  const readNotifications = notifications.filter((item) => item.read === 1);
  const filteredUnreadNotifications = unreadNotifications.filter(
    (notification) =>
      matchesNotificationFilter(notification, unreadNotificationFilter)
  );
  const filteredReadNotifications = readNotifications.filter((notification) =>
    matchesNotificationFilter(notification, readNotificationFilter)
  );
  const unreadCount = unreadNotifications.length;
  const readCount = readNotifications.length;
  const appointmentCount = appointments.length;
  const hasUnreadNotifications = unreadCount > 0;
  const hasReadNotifications = readCount > 0;

  useEffect(() => {
    if (showUnreadNotifications && unreadSectionRef.current) {
      unreadSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [showUnreadNotifications]);

  useEffect(() => {
    if (showCompletedAppointments && completedSectionRef.current) {
      completedSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [showCompletedAppointments]);

  useEffect(() => {
    if (showExecutionHistory && executionHistoryRef.current) {
      executionHistoryRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }, [showExecutionHistory]);

  return (
    <div className="bg-background text-on-surface min-h-screen p-6 page-root">
      {inAppPopup ? (
        <div className="fixed bottom-6 right-6 z-[1200] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-primary/40 bg-surface shadow-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-on-surface">
                {inAppPopup.title}
              </p>
              <p className="mt-1 text-sm text-on-surface-variant whitespace-pre-line">
                {inAppPopup.body}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInAppPopup(null)}
              className="rounded-full border border-outline-variant bg-surface px-2 py-1 text-xs font-semibold text-on-surface hover:bg-surface-container-high"
            >
              Chiudi
            </button>
          </div>
        </div>
      ) : null}
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="relative">
          <div>
            <h1 className="font-headline-lg text-headline-lg admin-page__title">
              Ciao, {userName || "Giardiniere"}
            </h1>
            <div className="mt-4 ml-1 text-sm text-on-surface">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <span className="material-symbols-outlined text-base">
                  {pushStatus === "subscribed"
                    ? "notifications_active"
                    : "notifications_off"}
                </span>
                {pushStatus === "subscribed"
                  ? "Notifiche attive"
                  : "Notifiche non attive"}
              </div>
              <p className="mt-2 text-sm text-on-surface-variant">
                {pushStatus === "unsupported" &&
                  "Il browser non supporta le notifiche push o il service worker non è disponibile."}
                {pushStatus === "denied" &&
                  "Hai bloccato le notifiche del browser. Controlla le impostazioni del sito e riattiva le notifiche."}
                {pushStatus === "granted" &&
                  "Richiesta di sottoscrizione in corso..."}
                {pushStatus === "unknown" &&
                  "Le notifiche push saranno attivate automaticamente."}
              </p>
              {pushError ? (
                <div className="mt-3 rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error">
                  <strong>Errore push:</strong> {pushError}
                </div>
              ) : null}
            </div>
            <div className="admin-page__divider mt-3" />
          </div>
          <div className="mt-4 flex flex-row flex-wrap gap-3 justify-center">
            {hasUnreadNotifications ? (
              <button
                type="button"
                onClick={() => {
                  const willOpen = !showUnreadNotifications;
                  setShowUnreadNotifications(willOpen);
                  if (willOpen) {
                    setUnreadNotificationFilter("all");
                  }
                  setShowCompletedAppointments(false);
                  setShowExecutionHistory(false);
                }}
                className={`max-w-[calc(33.333%-0.75rem)] flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white border transition duration-200 ${showUnreadNotifications ? "shadow-xl ring-2 ring-black scale-[1.05]" : anyPanelOpen ? "scale-[0.9] hover:scale-[0.95] hover:shadow-lg" : "hover:-translate-y-0.5 hover:shadow-lg hover:scale-[1.01]"}`}
                style={{ backgroundColor: "#b91c1c", borderColor: "#991b1b" }}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-xs leading-tight uppercase tracking-[0.06em]">
                    notifiche non lette
                  </span>
                  <span className="text-base font-bold">{unreadCount}</span>
                </div>
              </button>
            ) : (
              <div
                className="max-w-[calc(33.333%-0.75rem)] flex-1 rounded-full px-4 py-2 text-sm font-semibold text-on-surface border"
                style={{ backgroundColor: "#b91c1c", borderColor: "#991b1b" }}
              >
                Nessuna notifica non letta
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                const willOpen = !showCompletedAppointments;
                setShowCompletedAppointments(willOpen);
                if (willOpen) {
                  setReadNotificationFilter("all");
                }
                setShowUnreadNotifications(false);
                setShowExecutionHistory(false);
              }}
              className={`max-w-[calc(33.333%-0.75rem)] flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white border transition duration-200 ${showCompletedAppointments ? "shadow-xl ring-2 ring-black scale-[1.05]" : anyPanelOpen ? "scale-[0.9] hover:scale-[0.95] hover:shadow-lg" : "hover:-translate-y-0.5 hover:shadow-lg hover:scale-[1.01]"}`}
              style={{ backgroundColor: "#16a34a", borderColor: "#15803d" }}
            >
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs leading-tight uppercase tracking-[0.06em]">
                  notifiche lette
                </span>
                <span className="text-base font-bold">{readCount}</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                const willOpen = !showExecutionHistory;
                setShowExecutionHistory(willOpen);
                setShowUnreadNotifications(false);
                setShowCompletedAppointments(false);
              }}
              className={`max-w-[calc(33.333%-0.75rem)] flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white border transition duration-200 ${showExecutionHistory ? "shadow-xl ring-2 ring-black scale-[1.05]" : anyPanelOpen ? "scale-[0.9] hover:scale-[0.95] hover:shadow-lg" : "hover:-translate-y-0.5 hover:shadow-lg hover:scale-[1.01]"}`}
              style={{ backgroundColor: "#0ea5e9", borderColor: "#0284c7" }}
            >
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs leading-tight uppercase tracking-[0.06em]">
                  storico esecuzioni
                </span>
                <span className="text-base font-bold">
                  {executionHistory.length}
                </span>
              </div>
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="absolute right-0 top-0 w-touch-target-min h-touch-target-min flex items-center justify-center rounded-full border border-outline-variant bg-surface transition-colors active:scale-95 duration-150"
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

        {error ? (
          <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        ) : null}

        <div
          className={`grid gap-6 ${showUnreadNotifications && showCompletedAppointments ? "grid-cols-1 xl:grid-cols-[360px_1fr]" : "grid-cols-1"}`}
        >
          {showUnreadNotifications && (
            <section
              ref={unreadSectionRef}
              className="rounded-3xl border border-outline-variant bg-surface-container-low p-5 shadow-sm max-h-[60vh] overflow-hidden"
            >
              <div className="bg-surface-container-low pb-4 border-b border-outline-variant">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
                  <div>
                    <h2 className="font-headline-sm text-headline-sm text-error font-semibold ml-1">
                      Notifiche non lette
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(
                        [
                          "all",
                          "avvisi",
                          "appuntamenti"
                        ] as NotificationFilterOption[]
                      ).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setUnreadNotificationFilter(option)}
                          className={getFilterButtonClasses(
                            option,
                            unreadNotificationFilter === option
                          )}
                        >
                          {option === "all"
                            ? "Tutti"
                            : option === "avvisi"
                              ? "Avvisi"
                              : "Appuntamenti"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[calc(60vh-6.5rem)]">
                {loading ? (
                  <p className="text-sm text-on-surface-variant">
                    Caricamento...
                  </p>
                ) : filteredUnreadNotifications.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    Nessuna notifica non letta.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredUnreadNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`rounded-2xl border p-4 transition ${getNotificationCardClasses(
                          formatNotification(notification).title
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            {(() => {
                              const formatted =
                                formatNotification(notification);
                              return (
                                <>
                                  <p className="font-label-md text-label-md font-semibold text-on-surface">
                                    {formatted.title}
                                  </p>
                                  <div className="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap">
                                    {formatted.lines.map((line, index) => (
                                      <p key={index} className="break-words">
                                        {line}
                                      </p>
                                    ))}
                                  </div>
                                  {notification.executionId ? (
                                    <div className="mt-3 rounded-2xl bg-surface-container-low p-3 text-sm text-on-surface-variant">
                                      {notification.executionDate ? (
                                        <p className="font-medium text-on-surface">
                                          Eseguito il{" "}
                                          {new Date(
                                            notification.executionDate
                                          ).toLocaleDateString("it-IT")}
                                        </p>
                                      ) : null}
                                      {notification.executionNotes ? (
                                        <p className="mt-1 break-words">
                                          {notification.executionNotes}
                                        </p>
                                      ) : null}
                                      {notification.executionPhotoUrls
                                        ?.length ? (
                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                          {notification.executionPhotoUrls.map(
                                            (photoUrl, index) => (
                                              <img
                                                key={index}
                                                src={photoUrl}
                                                alt={`Foto esecuzione ${index + 1}`}
                                                className="h-20 w-full rounded-2xl object-cover"
                                              />
                                            )
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>
                          {notification.read === 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                markNotificationRead(notification.id)
                              }
                              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface transition hover:bg-surface-container-high"
                              aria-label="Segna come letta"
                            >
                              <span className="material-symbols-outlined text-lg">
                                check_circle_outline
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <span className="material-symbols-outlined text-lg">
                                check_circle
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {showCompletedAppointments && (
            <section
              ref={completedSectionRef}
              className="rounded-3xl border border-outline-variant bg-surface-container-low p-5 shadow-sm max-h-[60vh] overflow-hidden"
            >
              <div className="bg-surface-container-low pb-4 border-b border-outline-variant">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
                  <div>
                    <h2
                      className="font-headline-sm text-headline-sm font-semibold ml-1"
                      style={{ color: "#16a34a" }}
                    >
                      Notifiche lette
                    </h2>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(
                        [
                          "all",
                          "avvisi",
                          "appuntamenti"
                        ] as NotificationFilterOption[]
                      ).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setReadNotificationFilter(option)}
                          className={getFilterButtonClasses(
                            option,
                            readNotificationFilter === option
                          )}
                        >
                          {option === "all"
                            ? "Tutti"
                            : option === "avvisi"
                              ? "Avvisi"
                              : "Appuntamenti"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[calc(60vh-6.5rem)]">
                {loading ? (
                  <p className="text-sm text-on-surface-variant">
                    Caricamento...
                  </p>
                ) : filteredReadNotifications.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    Nessuna notifica letta.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredReadNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => openExecutionModal(notification)}
                        className={`rounded-2xl border p-4 transition ${getNotificationCardClasses(
                          formatNotification(notification).title
                        )}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            {(() => {
                              const formatted =
                                formatNotification(notification);
                              return (
                                <>
                                  <p className="font-label-md text-label-md font-semibold text-on-surface">
                                    {formatted.title}
                                  </p>
                                  <div className="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap">
                                    {formatted.lines.map((line, index) => (
                                      <p key={index} className="break-words">
                                        {line}
                                      </p>
                                    ))}
                                  </div>
                                  {notification.executionId ? (
                                    <div className="mt-3 rounded-2xl bg-surface-container-low p-3 text-sm text-on-surface-variant">
                                      {notification.executionDate ? (
                                        <p className="font-medium text-on-surface">
                                          Eseguito il{" "}
                                          {new Date(
                                            notification.executionDate
                                          ).toLocaleDateString("it-IT")}
                                        </p>
                                      ) : null}
                                      {notification.executionNotes ? (
                                        <p className="mt-1 break-words">
                                          {notification.executionNotes}
                                        </p>
                                      ) : null}
                                      {notification.executionPhotoUrls
                                        ?.length ? (
                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                          {notification.executionPhotoUrls.map(
                                            (photoUrl, index) => (
                                              <img
                                                key={index}
                                                src={photoUrl}
                                                alt={`Foto esecuzione ${index + 1}`}
                                                className="h-20 w-full rounded-2xl object-cover"
                                              />
                                            )
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </>
                              );
                            })()}
                          </div>
                          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <span className="material-symbols-outlined text-lg">
                              check_circle
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {showExecutionHistory && (
        <section
          ref={executionHistoryRef}
          className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm mt-6"
        >
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-sky-200">
            <div>
              <h2 className="font-headline-sm text-headline-sm font-semibold ml-1 text-sky-900">
                Storico esecuzioni
              </h2>
              <p className="text-sm text-sky-700/80 mt-1">
                Elenco delle esecuzioni registrate.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3 max-h-[40vh] overflow-y-auto">
            {executionHistory.length === 0 ? (
              <p className="text-sm text-sky-900/80">
                Nessuna esecuzione ancora registrata.
              </p>
            ) : (
              <div className="space-y-3">
                {executionHistory.map((execution) => (
                  <div
                    key={execution.id}
                    className="rounded-2xl border border-sky-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sky-900">
                          {execution.title || "Notifica eseguita"}
                        </p>
                        <p className="text-sm text-sky-700/80 mt-1">
                          {execution.execution_date
                            ? `Eseguito il ${new Date(execution.execution_date).toLocaleDateString("it-IT")}`
                            : "Data esecuzione non specificata"}
                        </p>
                        {execution.notes ? (
                          <p className="text-sm text-sky-700/80 mt-2 break-words">
                            {execution.notes}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {execution.photoUrls?.length ? (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {execution.photoUrls.map((photoUrl, index) => (
                          <img
                            key={index}
                            src={photoUrl}
                            alt={`Foto storico ${index + 1}`}
                            className="h-20 w-full rounded-2xl object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {selectedNotificationForExecution ? (
        <>
          {selectedPreviewUrl ? (
            <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/80 p-4">
              <div className="relative max-h-[90vh] max-w-[90vw] overflow-visible rounded-3xl bg-black p-4">
                <button
                  type="button"
                  onClick={() => setSelectedPreviewUrl(null)}
                  className="absolute -left-3 -top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface/95 text-on-surface shadow-lg ring-1 ring-black/30 transition hover:bg-surface"
                  aria-label="Chiudi anteprima"
                >
                  <span className="material-symbols-outlined text-base">
                    close
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleDeletePreview}
                  className="absolute -right-3 -top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-error/95 text-white shadow-lg ring-1 ring-black/30 transition hover:bg-error"
                  aria-label="Elimina foto"
                >
                  <span className="material-symbols-outlined text-base">
                    delete
                  </span>
                </button>
                <img
                  src={selectedPreviewUrl}
                  alt="Anteprima ingrandita"
                  className="max-h-[82vh] w-full object-contain"
                />
              </div>
            </div>
          ) : null}
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-3xl bg-surface p-5 shadow-2xl ring-1 ring-black/10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase text-on-surface-variant">
                    Gestione notifica
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-on-surface">
                    {formatNotification(selectedNotificationForExecution).title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeExecutionModal}
                  className="rounded-full border border-outline-variant bg-surface p-2 text-on-surface transition hover:bg-surface-container-high"
                  aria-label="Chiudi modale"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_280px]">
                <div>
                  <p className="pl-3 text-sm font-medium text-on-surface mb-2">
                    Dettaglio notifica
                  </p>
                  <div className="rounded-2xl border border-outline-variant bg-surface p-4 mb-4">
                    <div className="space-y-2 text-sm text-on-surface-variant">
                      {/^Nuovo avviso\s*:/i.test(
                        selectedNotificationForExecution.title
                      ) ? (
                        <>
                          <p>
                            Messaggio :{" "}
                            {selectedNotificationForExecution.message.match(
                              /Messaggio\s*:\s*(.+)$/im
                            )?.[1] || selectedNotificationForExecution.message}
                          </p>
                          {selectedNotificationForExecution.message.match(
                            /Cliente\s*:\s*(.+)$/im
                          ) ? (
                            <p>
                              Cliente :{" "}
                              {
                                selectedNotificationForExecution.message.match(
                                  /Cliente\s*:\s*(.+)$/im
                                )?.[1]
                              }
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p>{selectedNotificationForExecution.title}</p>
                      )}
                      <p>
                        Data :{" "}
                        {new Date(
                          selectedNotificationForExecution.created_at
                        ).toLocaleDateString("it-IT")}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="pl-3 mb-2 block text-sm font-medium text-on-surface">
                        Data esecuzione
                      </label>
                      <input
                        type="date"
                        value={executionDate}
                        onChange={(event) =>
                          setExecutionDate(event.target.value)
                        }
                        className="w-full rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary"
                      />
                    </div>

                    <div>
                      <label className="pl-3 mb-1 block text-sm font-medium text-on-surface">
                        Note lavoro
                      </label>
                      <textarea
                        rows={4}
                        value={executionNotes}
                        onChange={(event) =>
                          setExecutionNotes(event.target.value)
                        }
                        className="w-full resize-none rounded-2xl border border-outline-variant bg-surface px-4 py-3 text-sm text-on-surface outline-none transition focus:border-primary"
                        placeholder="Operazioni eseguite"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <label className="pl-3 inline-flex cursor-pointer items-center gap-4 text-sm font-medium text-on-surface">
                      <span>Foto esecuzione</span>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-white">
                        <span className="material-symbols-outlined text-base">
                          camera_alt
                        </span>
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        onChange={handleExecutionPhotoChange}
                        className="hidden"
                      />
                    </label>
                    <div className="ml-auto flex flex-col items-end gap-1 text-right">
                      <span className="text-xs text-on-surface-variant uppercase">
                        max 8
                      </span>
                      <p className="text-[0.65rem] font-semibold text-on-surface-variant">
                        Tocca una miniatura per ingrandire
                      </p>
                    </div>
                  </div>
                  <div
                    className="rounded-2xl border border-outline-variant bg-surface-container-low p-1 overflow-y-auto"
                    style={{ marginTop: "10px", height: "185px" }}
                  >
                    {executionPhotoPreviews.length > 0 ? (
                      <div className="grid w-fit grid-cols-4 gap-x-4 gap-y-2 mx-auto justify-center">
                        {executionPhotoPreviews.map((preview, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setSelectedPreviewUrl(preview)}
                            className="h-20 w-20 overflow-hidden rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <img
                              src={preview}
                              alt={`Anteprima foto ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveExecution}
                    className="w-full rounded-3xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
                  >
                    Salva esecuzione
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default GiardinierePage;
