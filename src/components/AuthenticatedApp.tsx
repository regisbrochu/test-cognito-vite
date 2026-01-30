import { useState } from 'react';
import LanguageSelector from './LanguageSelector';
import reactLogo from '../assets/react.svg';
import viteLogo from '/vite.svg';

interface Language {
  code: string;
  label: string;
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

interface AuthenticatedAppProps {
  user: UserInfo;
  signOut: () => void;
  language: string;
  onLanguageChange: (code: string) => void;
  languages: Language[];
}

function AuthenticatedApp({ user, signOut, language, onLanguageChange, languages }: AuthenticatedAppProps) {
  const [count, setCount] = useState(0);

  const translations: Record<string, Record<string, string>> = {
    en: {
      welcome: 'Welcome',
      signOut: 'Sign Out',
      userInfo: 'User Information',
      username: 'Username',
      userId: 'User ID',
      email: 'Email',
      name: 'Name',
      firstName: 'First Name',
      lastName: 'Last Name',
    },
    fr: {
      welcome: 'Bienvenue',
      signOut: 'Déconnexion',
      userInfo: 'Informations utilisateur',
      username: 'Nom d\'utilisateur',
      userId: 'ID utilisateur',
      email: 'Courriel',
      name: 'Nom',
      firstName: 'Prénom',
      lastName: 'Nom de famille',
    },
    es: {
      welcome: 'Bienvenido',
      signOut: 'Cerrar sesión',
      userInfo: 'Información del usuario',
      username: 'Nombre de usuario',
      userId: 'ID de usuario',
      email: 'Correo electrónico',
      name: 'Nombre',
      firstName: 'Nombre',
      lastName: 'Apellido',
    },
  };

  const t = translations[language] || translations.en;

  return (
    <>
      <header className="app-header">
        <span>{t.welcome}, {user.givenName || user.email || user.username}</span>
        <div className="header-actions">
          <LanguageSelector
            languages={languages}
            value={language}
            onChange={onLanguageChange}
          />
          <button onClick={signOut} className="sign-out-button">
            {t.signOut}
          </button>
        </div>
      </header>

      <div className="user-info">
        <h2>{t.userInfo}</h2>
        <table className="user-info-table">
          <tbody>
            <tr>
              <td><strong>{t.username}</strong></td>
              <td>{user.username}</td>
            </tr>
            <tr>
              <td><strong>{t.userId}</strong></td>
              <td>{user.userId}</td>
            </tr>
            {user.email && (
              <tr>
                <td><strong>{t.email}</strong></td>
                <td>{user.email} {user.emailVerified && '✓'}</td>
              </tr>
            )}
            {user.name && (
              <tr>
                <td><strong>{t.name}</strong></td>
                <td>{user.name}</td>
              </tr>
            )}
            {user.givenName && (
              <tr>
                <td><strong>{t.firstName}</strong></td>
                <td>{user.givenName}</td>
              </tr>
            )}
            {user.familyName && (
              <tr>
                <td><strong>{t.lastName}</strong></td>
                <td>{user.familyName}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default AuthenticatedApp;
