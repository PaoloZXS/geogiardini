import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  read: number;
  created_at: string;
};

type AppointmentItem = {
  id: string;
  data: string;
  clienteNome: string;
  note: string;
  attivita: string[];
  giardinieri: Array<{ id: string; username: string }>;
};

function GiardinierePage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [pushStatus, setPushStatus] = useState<'unknown' | 'unsupported' | 'denied' | 'granted' | 'subscribed'>('unknown');
  const [pushError, setPushError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [serviceWorkerControlled, setServiceWorkerControlled] = useState(false);

  const registerPushSubscription = async (userId: string) => {
    setPushError(null);
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setPushStatus('unsupported');
      setNotificationPermission(
        typeof window !== 'undefined' ? Notification.permission : 'default'
      );
      setServiceWorkerControlled(
        typeof window !== 'undefined' && 'serviceWorker' in navigator
          ? !!navigator.serviceWorker.controller
          : false
      );
      setPushError('Il browser non supporta le notifiche push.');
      return;
    }

    setNotificationPermission(Notification.permission);
    setServiceWorkerControlled(!!navigator.serviceWorker.controller);

    if (Notification.permission === 'denied') {
      setPushStatus('denied');
      setPushError('Notifiche bloccate nelle impostazioni del browser.');
      return;
    }

    setPushStatus('granted');
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          setNotificationPermission(permission);
          if (permission !== 'granted') {
            setPushStatus('denied');
            setPushError('Permessi notifiche non concessi.');
            return;
          }
        }

        if (Notification.permission !== 'granted') {
          setPushStatus('denied');
          setPushError('Permessi notifiche non concessi.');
          return;
        }

        const publicKeyResponse = await fetch('/api/push-public-key');
        const publicKeyData = await publicKeyResponse.json().catch(() => null);
        if (!publicKeyResponse.ok) {
          const serverMessage =
            publicKeyData?.message ||
            `Errore ${publicKeyResponse.status} recuperando la chiave push dal server.`;
          setPushError(serverMessage);
          setPushStatus('unknown');
          return;
        }
        const applicationServerKey = urlBase64ToUint8Array(
          publicKeyData?.publicKey || ''
        );

        if (!applicationServerKey.length) {
          const message = 'Chiave pubblica push non valida dal server.';
          console.error(message);
          setPushError(message);
          setPushStatus('unknown');
          return;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      const response = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          giardiniereId: userId,
          subscription
        })
      });

      if (!response.ok) {
        const body = await response.clone().json().catch(() => null);
        const rawText = await response.text().catch(() => '');
        const message =
          body?.message ||
          (rawText ? `Errore ${response.status} durante la registrazione push: ${rawText.slice(0, 180)}` : null) ||
          `Errore ${response.status} durante la registrazione push.`;
        console.error('Push subscription save failed', response.status, body);
        setPushError(message);
        setPushStatus('unknown');
        return;
      }

      setPushStatus('subscribed');
      setPushError(null);
      setServiceWorkerControlled(!!navigator.serviceWorker.controller);
    } catch (error) {
      console.error('Push registration failed', error);
      setPushError(error instanceof Error ? error.message : 'Registrazione push fallita.');
      setPushStatus('denied');
      setServiceWorkerControlled(!!navigator.serviceWorker.controller);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedId = window.localStorage.getItem('userId');
    const storedName = window.localStorage.getItem('loginUsername') || '';
    const storedRole = window.localStorage.getItem('loginRole');

    if (!storedId || storedRole !== 'giardiniere') {
      navigate('/geologin', { replace: true });
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
    if (!userId || typeof window === 'undefined') return;

    const refreshPushSubscription = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        void registerPushSubscription(userId);
      }
    };

    window.addEventListener('focus', refreshPushSubscription);
    document.addEventListener('visibilitychange', refreshPushSubscription);

    return () => {
      window.removeEventListener('focus', refreshPushSubscription);
      document.removeEventListener('visibilitychange', refreshPushSubscription);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const handleStorageChange = () => {
      const lastPush = window.localStorage.getItem('pushNotificationReceived');
      if (lastPush) {
        setRefreshKey((current) => current + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        setRefreshKey((current) => current + 1);
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      setLoading(true);
      setError('');

      try {
        const [notificheRes, appointmentsRes] = await Promise.all([
          fetch(`/api/notifiche?giardiniereId=${encodeURIComponent(userId)}&read=0`),
          fetch(`/api/appuntamenti?giardiniereId=${encodeURIComponent(userId)}`),
        ]);

        const notificheData = await notificheRes.json().catch(() => null);
        const appointmentsData = await appointmentsRes.json().catch(() => null);

        if (!notificheRes.ok) {
          throw new Error(notificheData?.message || 'Errore caricamento notifiche.');
        }
        if (!appointmentsRes.ok) {
          throw new Error(appointmentsData?.message || 'Errore caricamento appuntamenti.');
        }

        setNotifications(Array.isArray(notificheData?.notifiche) ? notificheData.notifiche : []);
        setAppointments(Array.isArray(appointmentsData?.appointments) ? appointmentsData.appointments : []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Errore durante il caricamento.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userId, refreshKey]);

  const markNotificationRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifiche/${id}/read`, { method: 'PUT' });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || 'Errore segnare notifica come letta.');
      }
      setRefreshKey((current) => current + 1);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Errore durante l\'aggiornamento.');
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('userId');
      window.localStorage.removeItem('loginUsername');
      window.localStorage.removeItem('loginRole');
    }
    navigate('/geologin', { replace: true });
  };

  const formatNotification = (notification: NotificationItem) => {
    const appointmentTitleMatch = notification.title.match(/^Nuovo appuntamento per\s*(.+)$/i);
    const appointmentAltTitleMatch = notification.title.match(/^Appuntamento da\s*:$/i);
    if (appointmentTitleMatch || appointmentAltTitleMatch) {
      const clienteName = appointmentTitleMatch ? appointmentTitleMatch[1].trim() : '';
      const message = notification.message || '';
      const lines: string[] = [];

      if (clienteName) {
        lines.push(`Cliente : ${clienteName}`);
      } else {
        const clientMatch = message.match(/^Cliente\s*:\s*(.+)$/m);
        if (clientMatch?.[1]) {
          lines.push(`Cliente : ${clientMatch[1].trim()}`);
        }
      }

      const activityMatch = message.match(/^(?:Attività da svolgere|Attivita' da svolgere|Attivita'\s*:\s*|Attività\s*:\s*)(.+)$/im);
      if (activityMatch?.[1]) {
        lines.push(`Attività da svolgere : ${activityMatch[1].trim()}`);
      } else {
        const activityLineMatch = message.match(/(?:Hai un nuovo appuntamento il\s*\d{4}-\d{2}-\d{2}:?\s*)(.+)$/i);
        if (activityLineMatch?.[1]) {
          lines.push(`Attività da svolgere : ${activityLineMatch[1].trim().replace(/[.。]+$/, '')}`);
        }
      }

      const dateMatch = message.match(/Data Appuntamento\s*:\s*(.+)$/im) || message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (dateMatch?.[1]) {
        const parsed = new Date(dateMatch[1].trim());
        if (!Number.isNaN(parsed.getTime())) {
          lines.push(`Data attività : ${parsed.toLocaleDateString('it-IT')}`);
        } else {
          lines.push(`Data attività : ${dateMatch[1].trim()}`);
        }
      }

      return {
        title: 'Nuovo Appuntamento :',
        lines,
      };
    }

    const avvisoTitleMatch = notification.title.match(/^Nuovo avviso\s*:/i);
    if (avvisoTitleMatch) {
      const message = notification.message || '';
      const lines: string[] = [];
      const clientMatch = message.match(/^Cliente\s*:\s*(.+)$/m);
      const msgMatch = message.match(/^Messaggio\s*:\s*(.+)$/m);
      if (clientMatch?.[1]) {
        lines.push(`Cliente : ${clientMatch[1].trim()}`);
      }
      if (msgMatch?.[1]) {
        lines.push(`Avviso : ${msgMatch[1].trim()}`);
      }
      lines.push(`Data avviso : ${new Date(notification.created_at).toLocaleDateString('it-IT')}`);
      return {
        title: notification.title,
        lines,
      };
    }

    return {
      title: notification.title,
      lines: notification.message ? notification.message.split('\n') : [],
    };
  };

  const unreadCount = notifications.filter((item) => item.read === 0).length;

  return (
    <div className="bg-background text-on-surface min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-headline-lg text-headline-lg">Ciao, {userName || 'Giardiniere'}</h1>
            <p className="font-body-md text-on-surface-variant">
              Qui trovi gli appuntamenti e le notifiche a te assegnate.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
              {unreadCount} notifiche non lette
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-11 items-center justify-center rounded-full border border-outline-variant bg-surface px-4 text-sm font-bold transition hover:bg-surface-container-high"
            >
              Logout
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        ) : null}

        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          <div className="font-semibold">
            {pushStatus === 'subscribed'
              ? 'Notifiche push attive'
              : 'Notifiche push non attivate'}
          </div>
          <p className="mt-2 text-sm text-warning/foreground">
            {pushStatus === 'unsupported' && 'Il browser non supporta le notifiche push o il service worker non è disponibile.'}
            {pushStatus === 'denied' && 'Hai bloccato le notifiche del browser. Controlla le impostazioni del sito e riattiva le notifiche.'}
            {pushStatus === 'granted' && 'Richiesta di sottoscrizione in corso...'}
            {pushStatus === 'subscribed' && 'La sottoscrizione push è attiva. Se non vedi notifiche, prova ad aggiornare la sottoscrizione.'}
            {pushStatus === 'unknown' && 'Premi il pulsante qui sotto per attivare le notifiche push.'}
          </p>
          <p className="mt-2 text-sm text-surface-variant">
            Permessi: {notificationPermission}
            <br />
            Service Worker attivo: {serviceWorkerControlled ? 'sì' : 'no'}
          </p>
          {pushError ? (
            <div className="mt-3 rounded-xl border border-error/40 bg-error/10 p-3 text-sm text-error">
              <strong>Errore push:</strong> {pushError}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => registerPushSubscription(userId)}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-full border border-outline-variant bg-surface px-4 text-sm font-bold transition hover:bg-surface-container-high"
          >
            {pushStatus === 'subscribed' ? 'Aggiorna sottoscrizione push' : 'Abilita notifiche push'}
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <p className="font-label-sm text-label-sm text-on-surface-variant">Notifiche</p>
                <h2 className="font-headline-sm text-headline-sm">Aggiornamenti</h2>
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((current) => current + 1)}
                className="rounded-full border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface transition hover:bg-surface-container-high"
              >
                Aggiorna
              </button>
            </div>
            {loading ? (
              <p className="text-sm text-on-surface-variant">Caricamento...</p>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Nessuna notifica nuova.</p>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`rounded-2xl border p-4 transition ${notification.read === 0 ? 'border-primary/40 bg-primary/10' : 'border-outline-variant bg-surface'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {(() => {
                          const formatted = formatNotification(notification);
                          return (
                            <>
                              <p className="font-label-md text-label-md font-semibold text-on-surface">{formatted.title}</p>
                              <div className="text-sm text-on-surface-variant mt-1 whitespace-pre-wrap overflow-x-auto">
                                {formatted.lines.map((line, index) => (
                                  <p key={index} className="whitespace-nowrap">
                                    {line}
                                  </p>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {notification.read === 0 ? (
                        <button
                          type="button"
                          onClick={() => markNotificationRead(notification.id)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant bg-surface text-on-surface transition hover:bg-surface-container-high"
                          aria-label="Segna come letta"
                        >
                          <span className="material-symbols-outlined text-lg">check_circle_outline</span>
                        </button>
                      ) : (
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <span className="material-symbols-outlined text-lg">check_circle</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-outline-variant bg-surface-container-low p-5 shadow-sm">
            <div className="mb-4">
              <p className="font-label-sm text-label-sm text-on-surface-variant">Appuntamenti</p>
              <h2 className="font-headline-sm text-headline-sm">I tuoi lavori</h2>
            </div>
            {loading ? (
              <p className="text-sm text-on-surface-variant">Caricamento...</p>
            ) : appointments.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Nessun appuntamento assegnato.</p>
            ) : (
              <div className="space-y-4">
                {appointments.map((appointment) => (
                  <div key={appointment.id} className="rounded-2xl border border-outline-variant bg-surface p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-label-md text-label-md font-semibold text-on-surface">{appointment.clienteNome}</p>
                        <p className="text-sm text-on-surface-variant">{appointment.data}</p>
                      </div>
                      <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {appointment.attivita.length > 0 ? appointment.attivita.join(', ') : 'Nessuna attività'}
                      </div>
                    </div>
                    {appointment.note ? (
                      <p className="mt-3 text-sm text-on-surface-variant">Note: {appointment.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default GiardinierePage;
