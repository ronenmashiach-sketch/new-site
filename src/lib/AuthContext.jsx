'use client'

import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

const INVALID_APP_IDS = new Set(['', 'your-app-id']);

/**
 * Public settings (same endpoint the Base44 SDK used). Fetch-only — no @base44/sdk.
 */
async function fetchBase44PublicSettings(appId, token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-App-Id': String(appId),
  };
  if (typeof window !== 'undefined') {
    headers['X-Origin-URL'] = window.location.href;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `/api/apps/public/prod/public-settings/by-id/${encodeURIComponent(appId)}`;
  const res = await fetch(url, { method: 'GET', headers, credentials: 'same-origin' });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const err = new Error(data.message || data.detail || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [appParams, setAppParams] = useState(null);
  /** When true, Base44 checks ran (app id present). When false, standalone news UI without Base44. */
  const [base44Enabled, setBase44Enabled] = useState(false);

  useEffect(() => {
    const isNode = typeof window === 'undefined';
    if (isNode) return;

    const toSnakeCase = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

    const getAppParamValue = (paramName, { defaultValue = undefined, removeFromUrl = false } = {}) => {
      const storageKey = `base44_${toSnakeCase(paramName)}`;
      const urlParams = new URLSearchParams(window.location.search);
      const searchParam = urlParams.get(paramName);
      if (searchParam) {
        if (removeFromUrl) {
          urlParams.delete(paramName);
          const newUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
          window.history.replaceState({}, document.title, newUrl);
        }
        localStorage.setItem(storageKey, searchParam);
        return searchParam;
      }
      return localStorage.getItem(storageKey) || defaultValue;
    };

    const envAppId =
      (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BASE44_APP_ID) || '';

    let appId = getAppParamValue('appId', { defaultValue: envAppId }) ?? '';
    appId = String(appId).trim();
    if (appId === 'your-app-id') {
      try {
        localStorage.removeItem('base44_app_id');
      } catch {
        /* ignore */
      }
      appId = String(envAppId).trim();
    }

    const params = {
      appId,
      token: getAppParamValue('token'),
      functionsVersion: getAppParamValue('functionsVersion', { defaultValue: 'prod' }),
      appBaseUrl: getAppParamValue('appBaseUrl', { defaultValue: 'https://app.base44.com' }),
    };

    setAppParams(params);
  }, []);

  useEffect(() => {
    if (appParams) {
      checkAppState();
    }
  }, [appParams]);

  const checkAppState = async () => {
    if (!appParams) return;

    if (INVALID_APP_IDS.has((appParams.appId || '').trim())) {
      setBase44Enabled(false);
      setAuthError(null);
      setAppPublicSettings(null);
      setIsAuthenticated(false);
      setUser(null);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      return;
    }

    setBase44Enabled(true);

    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      try {
        const publicSettings = await fetchBase44PublicSettings(appParams.appId, appParams.token);
        setAppPublicSettings(publicSettings);

        if (appParams.token) {
          setUser({});
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
        setIsLoadingAuth(false);
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        const msg = typeof appError.message === 'string' ? appError.message : '';
        const looksLikeMissingApp =
          appError.status === 404 ||
          /not\s*found/i.test(msg) ||
          /app\s*not\s*found/i.test(msg);
        if (looksLikeMissingApp) {
          setAuthError({
            type: 'missing_app_configuration',
            message:
              'האפליקציה לא נמצאה ב-Base44. ודאו שה-appId נכון (מסוף Base44 או מה-URL של האפליקציה המאוחסנת).',
          });
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
          return;
        }

        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required',
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app',
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message,
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app',
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred',
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {};

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        appParams,
        base44Enabled,
        logout,
        navigateToLogin,
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
