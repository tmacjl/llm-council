import { useState } from 'react';
import './Login.css';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedUser = username.trim();
    const ok = onLogin(trimmedUser, password);
    if (!ok) {
      setError('Invalid credentials. Please try again.');
      setPassword('');
      return;
    }
    setError('');
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-eyebrow">Private Preview</span>
          <h1>LLM Council</h1>
          <p>Enter the council chamber and unlock the full deliberation flow.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Tracy McGrady"
              autoComplete="username"
              required
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="******"
              autoComplete="current-password"
              required
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="login-button" type="submit">
            Enter Council
          </button>
        </form>

        <div className="login-footer">
          <span>Single-account access enabled.</span>
        </div>
      </div>
    </div>
  );
}
