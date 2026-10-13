import { useEffect, useState } from 'react';
import { init } from '@adobe/exc-app';
import user from '@adobe/exc-app/user';

// How long to wait for Experience Cloud Shell before concluding the page was opened directly.
const SHELL_TIMEOUT_MS = 5000;

// Resolves the signed-in user's IMS token and org from Experience Cloud Shell.
// status: 'waiting' | 'ready' | 'outside' (not hosted in the Shell) | 'error'
export default function useShellAuth() {
  const [auth, setAuth] = useState({ status: 'waiting' });

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      if (alive) setAuth((a) => (a.status === 'waiting' ? { status: 'outside' } : a));
    }, SHELL_TIMEOUT_MS);

    init(async () => {
      try {
        const [token, org] = await Promise.all([user.get('imsToken'), user.get('imsOrg')]);
        if (!alive) return;
        setAuth({ status: 'ready', token, org });
        // the Shell refreshes tokens; keep ours current
        user.on('change:imsToken', (t) => alive && setAuth((a) => ({ ...a, token: t })));
        user.on('change:imsOrg', (o) => alive && setAuth((a) => ({ ...a, org: o })));
      } catch (e) {
        if (alive) setAuth({ status: 'error', message: e.message });
      }
    });

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return auth;
}
