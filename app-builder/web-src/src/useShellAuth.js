import { useEffect, useState } from 'react';
import Runtime, { init } from '@adobe/exc-app';

// How long to wait for the Shell's "ready" event before concluding we are not hosted in it.
const SHELL_TIMEOUT_MS = 8000;

// Resolves the signed-in user's IMS token and org from Experience Cloud Shell, following the
// official App Builder pattern: load exc-runtime.js, init(), then wait for the runtime "ready" event.
// status: 'waiting' | 'ready' | 'outside' (not hosted in the Shell) | 'error'
export default function useShellAuth() {
  const [auth, setAuth] = useState({ status: 'waiting' });

  useEffect(() => {
    let alive = true;
    const set = (next) => alive && setAuth(next);

    try {
      // throws unless we are in the Shell's iframe and it supplied the ?_mr= runtime script
      // eslint-disable-next-line global-require
      require('./exc-runtime');
    } catch (e) {
      set({ status: 'outside' });
      return () => { alive = false; };
    }

    const timer = setTimeout(() => {
      if (alive) setAuth((a) => (a.status === 'waiting' ? { status: 'outside' } : a));
    }, SHELL_TIMEOUT_MS);

    init(() => {
      const runtime = Runtime();
      runtime.on('ready', ({ imsOrg, imsToken, imsProfile }) => {
        runtime.done(); // tell the Shell we are done loading
        set({ status: 'ready', token: imsToken, org: imsOrg, profile: imsProfile });
      });
      // the Shell refreshes tokens and org switches through this event; keep ours current
      runtime.on('configuration', ({ imsOrg, imsToken }) => {
        if (alive) setAuth((a) => (a.status === 'ready' ? { ...a, token: imsToken || a.token, org: imsOrg || a.org } : a));
      });
      runtime.solution = { icon: 'AdobeExperienceCloud', title: 'CJA assessment submissions', shortTitle: 'CJA' };
      runtime.title = 'CJA assessment submissions';
    });

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return auth;
}
