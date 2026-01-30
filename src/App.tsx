import { useEffect, useState, useCallback } from 'react';
import { signInWithLang, exchangeCodeForTokens, getAuthorizationCode, validateState, clearAuthorizationCode, markExchangeInProgress, isExchangeInProgress } from './auth-utils';
import AuthenticatedApp from './components/AuthenticatedApp';
import LanguageSelector from './components/LanguageSelector';
import './App.css';

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
];

const TOKEN_STORAGE_KEY = 'auth_tokens';
const API_BASE_URL = 'http://localhost:8080';

interface StoredTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface UserInfo {
  username: string;
  userId: string;
  email?: string;
  emailVerified?: boolean;
  givenName?: string;
  familyName?: string;
  name?: string;
}

type UserStatus = 'loading' | 'approved' | 'pending' | 'deactivated' | 'error';

function parseJwt(token: string): Record<string, unknown> {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

function getUserInfoFromToken(idToken: string): UserInfo {
  const claims = parseJwt(idToken);
  return {
    username: claims['cognito:username'] as string || claims['sub'] as string,
    userId: claims['sub'] as string,
    email: claims['email'] as string | undefined,
    emailVerified: claims['email_verified'] as boolean | undefined,
    givenName: claims['given_name'] as string | undefined,
    familyName: claims['family_name'] as string | undefined,
    name: claims['name'] as string | undefined,
  };
}

const translations: Record<string, Record<string, string>> = {
  en: {
    welcome: 'Welcome',
    signIn: 'Sign In',
    pleaseSignIn: 'Please sign in to continue',
    pendingTitle: 'Account Pending Approval',
    pendingMessage: 'Your account has been created but is not yet approved. Please wait for an administrator to approve your account.',
    deactivatedTitle: 'Account Deactivated',
    deactivatedMessage: 'Your account has been deactivated. Please contact an administrator for more information.',
    errorTitle: 'Error',
    errorMessage: 'An error occurred while verifying your account. Please try again later.',
    retry: 'Retry',
    signOut: 'Sign Out',
  },
  fr: {
    welcome: 'Bienvenue',
    signIn: 'Se connecter',
    pleaseSignIn: 'Veuillez vous connecter pour continuer',
    pendingTitle: 'Compte en attente d\'approbation',
    pendingMessage: 'Votre compte a été créé mais n\'est pas encore approuvé. Veuillez attendre qu\'un administrateur approuve votre compte.',
    deactivatedTitle: 'Compte désactivé',
    deactivatedMessage: 'Votre compte a été désactivé. Veuillez contacter un administrateur pour plus d\'informations.',
    errorTitle: 'Erreur',
    errorMessage: 'Une erreur est survenue lors de la vérification de votre compte. Veuillez réessayer plus tard.',
    retry: 'Réessayer',
    signOut: 'Déconnexion',
  },
  es: {
    welcome: 'Bienvenido',
    signIn: 'Iniciar sesión',
    pleaseSignIn: 'Por favor, inicie sesión para continuar',
    pendingTitle: 'Cuenta pendiente de aprobación',
    pendingMessage: 'Su cuenta ha sido creada pero aún no está aprobada. Por favor espere a que un administrador apruebe su cuenta.',
    deactivatedTitle: 'Cuenta desactivada',
    deactivatedMessage: 'Su cuenta ha sido desactivada. Por favor, contacte a un administrador para más información.',
    errorTitle: 'Error',
    errorMessage: 'Se produjo un error al verificar su cuenta. Por favor, inténtelo de nuevo más tarde.',
    retry: 'Reintentar',
    signOut: 'Cerrar sesión',
  },
};

function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [userStatus, setUserStatus] = useState<UserStatus>('loading');
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('app-language') || 'en';
  });

  const t = translations[language] || translations.en;

  const checkUserStatus = useCallback(async (idToken: string): Promise<UserStatus> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/dashboard`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 200) {
        return 'approved';
      } else if (response.status === 403) {
        try {
          const body = await response.json();
          if (body.code === 'ACCOUNT_DESACTIVATED') {
            return 'deactivated';
          }
        } catch {
          // If we can't parse the body, treat as pending
        }
        return 'pending';
      } else {
        return 'error';
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      return 'error';
    }
  }, []);

  const checkStoredTokens = useCallback(async () => {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      const tokens: StoredTokens = JSON.parse(stored);
      if (tokens.expiresAt > Date.now()) {
        const userInfo = getUserInfoFromToken(tokens.idToken);
        setUser(userInfo);

        const status = await checkUserStatus(tokens.idToken);
        setUserStatus(status);
        return true;
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
    return false;
  }, [checkUserStatus]);

  useEffect(() => {
    async function handleAuth() {
      // Check for OAuth callback
      const authCode = getAuthorizationCode();
      if (authCode) {
        if (!validateState(authCode.state)) {
          console.error('Invalid OAuth state');
          clearAuthorizationCode();
          setLoading(false);
          return;
        }

        // Check if we already have valid tokens (prevents re-exchange on refresh)
        const existingTokens = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (existingTokens) {
          const tokens: StoredTokens = JSON.parse(existingTokens);
          if (tokens.expiresAt > Date.now()) {
            clearAuthorizationCode();
            const userInfo = getUserInfoFromToken(tokens.idToken);
            setUser(userInfo);
            const status = await checkUserStatus(tokens.idToken);
            setUserStatus(status);
            setLoading(false);
            return;
          }
        }

        // Check if exchange is already in progress (React StrictMode)
        if (isExchangeInProgress()) {
          // Wait for the other mount to complete the exchange
          const waitForTokens = async () => {
            for (let i = 0; i < 50; i++) { // Wait up to 5 seconds
              await new Promise(resolve => setTimeout(resolve, 100));
              const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
              if (stored) {
                const tokens: StoredTokens = JSON.parse(stored);
                if (tokens.expiresAt > Date.now()) {
                  clearAuthorizationCode();
                  const userInfo = getUserInfoFromToken(tokens.idToken);
                  setUser(userInfo);
                  const status = await checkUserStatus(tokens.idToken);
                  setUserStatus(status);
                  setLoading(false);
                  return true;
                }
              }
              // Check if exchange failed
              if (!isExchangeInProgress()) {
                break;
              }
            }
            return false;
          };

          const success = await waitForTokens();
          if (success) return;

          // Exchange failed or timed out
          clearAuthorizationCode();
          setUserStatus('error');
          setLoading(false);
          return;
        }

        // Mark exchange as in progress
        markExchangeInProgress();

        try {
          const tokens = await exchangeCodeForTokens(authCode.code);

          const storedTokens: StoredTokens = {
            accessToken: tokens.access_token,
            idToken: tokens.id_token,
            refreshToken: tokens.refresh_token,
            expiresAt: Date.now() + tokens.expires_in * 1000,
          };
          localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(storedTokens));

          // Clear pending code after successful exchange
          clearAuthorizationCode();

          const userInfo = getUserInfoFromToken(tokens.id_token);
          setUser(userInfo);

          // Check user status with backend
          const status = await checkUserStatus(tokens.id_token);
          setUserStatus(status);
        } catch (error) {
          console.error('Token exchange failed:', error);
          clearAuthorizationCode();
          setUserStatus('error');
        }
        setLoading(false);
        return;
      }

      // Check stored tokens
      await checkStoredTokens();
      setLoading(false);
    }

    handleAuth();
  }, [checkStoredTokens, checkUserStatus]);

  useEffect(() => {
    localStorage.setItem('app-language', language);
  }, [language]);

  async function handleSignIn() {
    await signInWithLang({ lang: language });
  }

  function handleSignOut() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setUserStatus('loading');

    // Redirect to Cognito logout
    const domain = import.meta.env.VITE_COGNITO_DOMAIN;
    const clientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
    const logoutUri = import.meta.env.VITE_REDIRECT_SIGN_OUT;

    const logoutUrl = `https://${domain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
    window.location.href = logoutUrl;
  }

  async function handleRetry() {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      const tokens: StoredTokens = JSON.parse(stored);
      setUserStatus('loading');
      const status = await checkUserStatus(tokens.idToken);
      setUserStatus(status);
    }
  }

  if (loading) {
    return (
      <>
        <div className="top-bar">
          <LanguageSelector
            languages={SUPPORTED_LANGUAGES}
            value={language}
            onChange={setLanguage}
          />
        </div>
        <div className="loading">Loading...</div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <div className="top-bar">
          <LanguageSelector
            languages={SUPPORTED_LANGUAGES}
            value={language}
            onChange={setLanguage}
          />
        </div>
        <div className="login-container">
          <h1>{t.welcome}</h1>
          <p>{t.pleaseSignIn}</p>
          <button onClick={handleSignIn} className="sign-in-button">
            {t.signIn}
          </button>
        </div>
      </>
    );
  }

  // User is authenticated but status is being checked
  if (userStatus === 'loading') {
    return (
      <>
        <div className="top-bar">
          <LanguageSelector
            languages={SUPPORTED_LANGUAGES}
            value={language}
            onChange={setLanguage}
          />
        </div>
        <div className="loading">Loading...</div>
      </>
    );
  }

  // User account is pending approval
  if (userStatus === 'pending') {
    return (
      <>
        <div className="top-bar">
          <LanguageSelector
            languages={SUPPORTED_LANGUAGES}
            value={language}
            onChange={setLanguage}
          />
        </div>
        <div className="status-container pending">
          <div className="status-icon">⏳</div>
          <h1>{t.pendingTitle}</h1>
          <p>{t.pendingMessage}</p>
          <p className="user-email">{user.email}</p>
          <div className="status-actions">
            <button onClick={handleRetry} className="retry-button">
              {t.retry}
            </button>
            <button onClick={handleSignOut} className="sign-out-button">
              {t.signOut}
            </button>
          </div>
        </div>
      </>
    );
  }

  // User account is deactivated
  if (userStatus === 'deactivated') {
    return (
      <>
        <div className="top-bar">
          <LanguageSelector
            languages={SUPPORTED_LANGUAGES}
            value={language}
            onChange={setLanguage}
          />
        </div>
        <div className="status-container deactivated">
          <div className="status-icon">🚫</div>
          <h1>{t.deactivatedTitle}</h1>
          <p>{t.deactivatedMessage}</p>
          <p className="user-email">{user.email}</p>
          <div className="status-actions">
            <button onClick={handleSignOut} className="sign-out-button">
              {t.signOut}
            </button>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (userStatus === 'error') {
    return (
      <>
        <div className="top-bar">
          <LanguageSelector
            languages={SUPPORTED_LANGUAGES}
            value={language}
            onChange={setLanguage}
          />
        </div>
        <div className="status-container error">
          <div className="status-icon">❌</div>
          <h1>{t.errorTitle}</h1>
          <p>{t.errorMessage}</p>
          <div className="status-actions">
            <button onClick={handleRetry} className="retry-button">
              {t.retry}
            </button>
            <button onClick={handleSignOut} className="sign-out-button">
              {t.signOut}
            </button>
          </div>
        </div>
      </>
    );
  }

  // User is approved
  return (
    <AuthenticatedApp
      user={user}
      signOut={handleSignOut}
      language={language}
      onLanguageChange={setLanguage}
      languages={SUPPORTED_LANGUAGES}
    />
  );
}

export default App;
