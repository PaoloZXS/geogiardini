import { useNavigate } from "react-router-dom";

function ClientePage() {
  const navigate = useNavigate();
  const handleBackToLogin = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("userId");
      window.localStorage.removeItem("loginUsername");
      window.localStorage.removeItem("loginRole");
      window.location.replace("/#/geologin");
      return;
    }
    navigate("/geologin", { replace: true });
  };

  return (
    <div className="bg-background text-on-surface h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-[32px] border border-outline-variant bg-surface-container-low p-8 shadow-2xl text-center">
        <h1 className="font-headline-lg text-headline-lg text-on-surface mb-4">
          Cliente
        </h1>
        <p className="font-body-md text-on-surface-variant mb-6">
          Sei entrato con le credenziali cliente. Questa pagina è un placeholder
          che possiamo sviluppare subito dopo.
        </p>
        <button
          type="button"
          onClick={handleBackToLogin}
          className="inline-flex h-11 px-5 items-center justify-center rounded-full bg-primary text-on-primary font-bold transition hover:bg-primary/90"
        >
          Torna al login
        </button>
      </div>
    </div>
  );
}

export default ClientePage;
