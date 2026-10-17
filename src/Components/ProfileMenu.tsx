import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Settings2 } from 'lucide-react';
import { api } from '../lib/api';
import type { User } from '../lib/api';

export default function ProfileMenu({
  user,
  saving,
  onSettings,
  onLogout,
}: {
  user: User;
  saving: boolean;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    firstAction.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div
      className="profile-menu"
      ref={root}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`profile-trigger ${open ? 'is-open' : ''}`}
        aria-label="Hesap menüsünü aç"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? 'account-popover' : undefined}
        onClick={() => {
          setError('');
          setOpen((value) => !value);
        }}
      >
        <span className="local-status">
          <span />
          {saving ? 'Kaydediliyor…' : 'Veritabanına bağlı'}
        </span>
        <span className="top-avatar">{user.name[0].toLocaleUpperCase('tr')}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div
          className="profile-popover"
          id="account-popover"
          role="dialog"
          aria-label="Hesap menüsü"
        >
          <div className="profile-menu-identity">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <div className="profile-menu-actions">
            <button
              type="button"
              ref={firstAction}
              disabled={pending}
              onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                onSettings();
              }}
            >
              <Settings2 size={17} />
              Çalışma alanı ayarları
            </button>
            <button
              type="button"
              className="profile-logout"
              disabled={pending || saving}
              onClick={async () => {
                if (pending || saving) return;
                setPending(true);
                setError('');
                try {
                  await api('/auth/logout', 'POST', {});
                  onLogout();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setPending(false);
                }
              }}
            >
              <LogOut size={17} />
              {pending ? 'Çıkış yapılıyor…' : 'Hesaptan çıkış yap'}
            </button>
          </div>
          {error && (
            <p role="alert" className="profile-menu-error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
