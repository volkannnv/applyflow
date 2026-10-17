import { useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/api';
export default function AccountSettings({ user }: { user: User }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  return (
    <section className="settings-panel account-settings">
      <h2>Hesabın</h2>
      <p className="muted">
        {user.name}
        <br />
        {user.email}
      </p>
      <form
        className="password-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          if (data.get('newPassword') !== data.get('confirmPassword')) {
            setError('Yeni parolalar eşleşmiyor.');
            return;
          }
          setPending(true);
          setError('');
          setSuccess('');
          try {
            await api('/auth/password', 'POST', {
              currentPassword: data.get('currentPassword'),
              newPassword: data.get('newPassword'),
            });
            form.reset();
            setSuccess('Parolan güncellendi. Diğer oturumların kapatıldı.');
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        <fieldset disabled={pending}>
          <label>
            Mevcut parola
            <input
              type="password"
              name="currentPassword"
              required
              maxLength={128}
              autoComplete="current-password"
            />
          </label>
          <label>
            Yeni parola
            <input
              type="password"
              name="newPassword"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <label>
            Yeni parola tekrar
            <input
              type="password"
              name="confirmPassword"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="success-message">
              {success}
            </p>
          )}
          <button className="button secondary" type="submit">
            {pending ? 'Güncelleniyor…' : 'Parolayı güncelle'}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
