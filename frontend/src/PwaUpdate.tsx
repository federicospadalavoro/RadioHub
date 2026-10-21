import { useRegisterSW } from "virtual:pwa-register/react";

export default function PwaUpdate() {
  const {
    needRefresh: [refresh, setRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!refresh) return null;
  return (
    <aside className="pwa-update" role="status">
      <span>È disponibile un aggiornamento.</span>
      <button onClick={() => void updateServiceWorker(true)}>Aggiorna</button>
      <button onClick={() => setRefresh(false)}>Più tardi</button>
    </aside>
  );
}
