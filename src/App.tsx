import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  LockKeyhole,
  ArrowRight,
  LoaderCircle,
} from 'lucide-react';
import { api, ApiError } from './lib/api';
import type { User } from './lib/api';
import Workspace from './Pages/Workspace';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [pending, setPending] = useState(false);
  async function session() {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ user: User }>('/auth/me');
      setUser(result.user);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void session();
    const expire = () => {
      setUser(null);
      setError('Oturumun sona erdi. Yeniden giriş yap.');
    };
    window.addEventListener('applyflow:unauthorized', expire);
    return () => window.removeEventListener('applyflow:unauthorized', expire);
  }, []);
  if (loading)
    return (
      <div className="session-loading" role="status">
        <LoaderCircle className="spin" size={27} />
        <p>Çalışma alanın hazırlanıyor…</p>
      </div>
    );
  if (user) return <Workspace key={user.id} user={user} onLogout={() => setUser(null)} />;
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <a className="brand" href="/">
          <span className="brand-icon">
            <BriefcaseBusiness size={21} />
            <ArrowUpRight size={12} />
          </span>
          apply<span>flow</span>
          <span className="brand-period">.</span>
        </a>
        <div>
          <p className="eyebrow">SANA AİT BİR ÇALIŞMA ALANI</p>
          <h1>
            Kariyer yolculuğun.
            <br />
            Kendi ritminde.
          </h1>
          <p>Fırsatlarını bir araya getir, görüşmelerini planla ve bir sonraki adımına odaklan.</p>
          <div className="auth-feature">
            <LockKeyhole size={18} />
            Başvuruların yalnızca kendi hesabında.
          </div>
        </div>
        <small>Küçük adımlar, büyük fırsatlar.</small>
      </section>
      <section className="auth-content">
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pending) return;
            const data = new FormData(e.currentTarget);
            setPending(true);
            setError('');
            try {
              const result = await api<{ user: User }>(`/auth/${mode}`, 'POST', {
                name: data.get('name'),
                email: data.get('email'),
                password: data.get('password'),
              });
              setUser(result.user);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setPending(false);
            }
          }}
        >
          <span className="eyebrow">BİR SONRAKİ ADIMIN BURADA</span>
          <h2>{mode === 'login' ? 'Yeniden merhaba.' : 'Yeni bir başlangıç.'}</h2>
          <p>
            {mode === 'login'
              ? 'Hesabına giriş yap, kaldığın yerden devam et.'
              : 'Kişisel çalışma alanını oluştur.'}
          </p>
          <div className="auth-tabs">
            <button
              type="button"
              aria-pressed={mode === 'login'}
              className={mode === 'login' ? 'selected' : ''}
              onClick={() => {
                setMode('login');
                setError('');
              }}
            >
              Giriş yap
            </button>
            <button
              type="button"
              aria-pressed={mode === 'register'}
              className={mode === 'register' ? 'selected' : ''}
              onClick={() => {
                setMode('register');
                setError('');
              }}
            >
              Hesap oluştur
            </button>
          </div>
          <fieldset disabled={pending}>
            {mode === 'register' && (
              <label>
                Adın
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Adın ve soyadın"
                />
              </label>
            )}
            <label>
              E-posta
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                placeholder="sen@ornek.com"
              />
            </label>
            <label>
              Parola
              <input
                key={mode}
                name="password"
                type="password"
                required
                minLength={mode === 'register' ? 12 : 1}
                maxLength={128}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? 'En az 12 karakter' : 'Parolanı gir'}
              />
            </label>
            {mode === 'register' && (
              <p className="field-help">
                En az 12 karakter kullan. E-posta doğrulama ve e-posta ile parola sıfırlama bu
                sürümde yoktur.
              </p>
            )}
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            <button className="button primary auth-submit" type="submit">
              {pending ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  İşlem yapılıyor…
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Giriş yap' : 'Hesabımı oluştur'}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </fieldset>
          <button type="button" className="text-button" onClick={() => void session()}>
            Bağlantıyı yeniden kontrol et
          </button>
          <div className="auth-note">
            <LockKeyhole size={14} />
            <span>
              Başvuruların hesabına bağlı olarak saklanır. Başka bir kullanıcı çalışma alanına
              erişemez.
            </span>
          </div>
        </form>
      </section>
    </div>
  );
}
