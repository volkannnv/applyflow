import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowUp,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  LayoutDashboard,
  List,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Upload,
  X,
  Columns3,
} from 'lucide-react';
import type { Application, Stage } from '../Interfaces/application';
import { labels, stages } from '../Interfaces/application';
import { STORAGE_KEY, localDate, moveApplication, parseApplications } from '../lib/model';
import { api, ApiError } from '../lib/api';
import type { User } from '../lib/api';
import AccountSettings from '../Components/AccountSettings';
import ApplicationCard from '../Components/ApplicationCard';
import ApplicationDialog from '../Components/ApplicationDialog';
import ProfileMenu from '../Components/ProfileMenu';
import ApplicationSankey from '../Components/ApplicationSankey';
type Page = 'board' | 'calendar' | 'stats' | 'settings';
const nav = [
  { id: 'board', label: 'Başvurularım', icon: LayoutDashboard },
  { id: 'calendar', label: 'Mülakat takvimi', icon: CalendarDays },
  { id: 'stats', label: 'İstatistikler', icon: ChartNoAxesCombined },
] as const;
export default function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [warning, setWarning] = useState('');
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const revision = useRef(0);
  const working = useRef(false);
  const [legacy, setLegacy] = useState<Application[] | null>(null);
  const [importLegacy, setImportLegacy] = useState(false);
  const [page, setPage] = useState<Page>('board');
  const [query, setQuery] = useState('');
  const [work, setWork] = useState('all');
  const [view, setView] = useState<'board' | 'list'>('board');
  const [dialog, setDialog] = useState<{ item: Application | null; stage: Stage } | null>(null);
  const [toast, setToast] = useState('');
  const [drop, setDrop] = useState<Stage | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [confirmClear, setConfirmClear] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function load() {
    if (working.current) return;
    working.current = true;
    setPending(true);
    setWarning('');
    try {
      const data = await api<{ applications: Application[]; revision: number }>('/applications');
      setApps(data.applications);
      revision.current = data.revision;
      setLoaded(true);
    } catch (err) {
      setWarning((err as Error).message);
    } finally {
      working.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    void load();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items = parseApplications(raw);
        if (items.length) setLegacy(items);
      }
    } catch {
      /* Old local records remain untouched. */
    }
  }, []);
  async function commit(
    next: Application[] | ((prev: Application[]) => Application[]),
    message: string,
    after?: () => void,
  ) {
    if (working.current || !loaded) return false;
    working.current = true;
    setPending(true);
    setDialogError('');
    setWarning('');
    try {
      const data = await api<{ applications: Application[]; revision: number }>(
        '/applications',
        'PUT',
        {
          applications: typeof next === 'function' ? next(apps) : next,
          revision: revision.current,
        },
      );
      setApps(data.applications);
      revision.current = data.revision;
      setToast(message);
      after?.();
      return true;
    } catch (err) {
      const message = (err as Error).message;
      setWarning(message);
      setDialogError(message);
      if (err instanceof ApiError && err.status === 409)
        setWarning(
          message + ' Sayfayı yenilemeden önce açık formundaki notları kopyalayabilirsin.',
        );
      return false;
    } finally {
      working.current = false;
      setPending(false);
    }
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const open = (item: Application) => {
    setDialogError('');
    setDialog({ item, stage: item.stage });
  };
  const count = (s: Stage) => apps.filter((a) => a.stage === s).length;
  const filtered = apps.filter(
    (a) =>
      (work === 'all' || a.workType === work) &&
      `${a.company} ${a.role} ${a.location}`
        .toLocaleLowerCase('tr')
        .includes(query.toLocaleLowerCase('tr')),
  );
  const meetings = apps
    .filter((a) => a.stage === 'interview' && a.interviewAt)
    .sort((a, b) => a.interviewAt.localeCompare(b.interviewAt));
  const upcoming = meetings.filter((a) => new Date(a.interviewAt) >= new Date());
  const applied = apps.filter((a) => a.stage !== 'saved').length;
  const rate = applied ? Math.round(((count('interview') + count('offer')) / applied) * 100) : 0;
  const demo = apps.some((a) => a.id.startsWith('demo-'));
  const changePage = (p: Page) => {
    setPage(p);
  };
  function exportData() {
    const blob = new Blob([JSON.stringify(apps, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `applyflow-${localDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('Başvuruların dışa aktarıldı.');
  }
  async function importData(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw Error();
      const incoming = parseApplications(await file.text());
      await commit((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]));
        incoming.forEach((a) => map.set(a.id, a));
        return [...map.values()];
      }, `${incoming.length} kayıt içe aktarıldı.`);
    } catch {
      setToast('Dosya okunamadı. Geçerli bir ApplyFlow JSON yedeği seç.');
    }
    if (fileRef.current) fileRef.current.value = '';
  }
  if (!loaded)
    return (
      <div className="session-loading" role="status">
        <p>{warning || 'Başvuruların yükleniyor…'}</p>
        {warning && (
          <button className="button primary" onClick={() => void load()} disabled={pending}>
            Yeniden dene
          </button>
        )}
      </div>
    );
  return (
    <div className={`app-shell ${pending ? 'is-saving' : ''}`}>
      <div className="main-shell">
        <header className="topbar app-header">
          <div className="header-inner">
            <a
              href="#"
              className="brand"
              onClick={(e) => {
                e.preventDefault();
                changePage('board');
              }}
            >
              <span className="brand-icon">
                <BriefcaseBusiness size={21} />
                <ArrowUpRight size={12} />
              </span>
              apply<span>flow</span>
              <span className="brand-period">.</span>
            </a>
            <nav className="header-nav" aria-label="Ana menü">
              {nav.map((n) => (
                <button
                  key={n.id}
                  className={`header-nav-item ${page === n.id ? 'active' : ''}`}
                  aria-current={page === n.id ? 'page' : undefined}
                  onClick={() => changePage(n.id)}
                >
                  <n.icon size={18} />
                  {n.label}
                  {n.id === 'board' && <span className="nav-count">{apps.length}</span>}
                </button>
              ))}
            </nav>
            <div className="topbar-right">
              <ProfileMenu
                user={user}
                saving={pending}
                onSettings={() => changePage('settings')}
                onLogout={onLogout}
              />
            </div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">BİR SONRAKİ ADIMIN BURADA</p>
              <h1>
                {page === 'board'
                  ? 'Fırsatlarını bir araya getir.'
                  : page === 'calendar'
                    ? 'Bir sonraki görüşmene hazır ol.'
                    : page === 'stats'
                      ? 'Yolculuğuna bir adım geriden bak.'
                      : 'Her şey senin kontrolünde.'}
              </h1>
              <p className="subtitle">
                {page === 'board'
                  ? 'Başvurularını takip et, sürecini yönet ve kariyerine yön ver.'
                  : page === 'calendar'
                    ? 'Görüşmelerini planla, notlarını gözden geçir, kendine güven.'
                    : page === 'stats'
                      ? 'Başvurularının hangi aşamada olduğunu sayılarla keşfet.'
                      : 'Başvurularını yedekle ve çalışma alanını düzenle.'}
              </p>
            </div>
            <button
              className="button primary"
              onClick={() => setDialog({ item: null, stage: 'saved' })}
            >
              <Plus size={18} />
              Yeni başvuru
            </button>
          </div>
          {warning && (
            <div role="alert" className="warning">
              {warning}
              <button className="text-button" onClick={() => void load()} disabled={pending}>
                Son verileri yükle
              </button>
              <button onClick={() => setWarning('')} aria-label="Uyarıyı kapat">
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stat-grid">
            {[
              {
                label: 'Toplam başvuru',
                value: apps.length,
                icon: BriefcaseBusiness,
                cls: 'green',
                sub: `${count('saved')} fırsat keşfedilmeyi bekliyor`,
              },
              {
                label: 'Devam eden süreç',
                value: count('applied') + count('interview'),
                icon: ArrowUpRight,
                cls: 'blue',
                sub: 'Her adım yeni bir ihtimal',
              },
              {
                label: 'Mülakat',
                value: count('interview'),
                icon: CalendarDays,
                cls: 'purple',
                sub: `${upcoming.length} yaklaşan görüşme`,
              },
              {
                label: 'Alınan teklif',
                value: count('offer'),
                icon: FileCheck2,
                cls: 'orange',
                sub: 'Emeğinin karşılığını gör',
              },
            ].map((s) => (
              <div className="stat-card" key={s.label}>
                <div className="stat-label">
                  {s.label}
                  <span className={`stat-icon ${s.cls}`}>
                    <s.icon size={18} />
                  </span>
                </div>
                <strong>{s.value.toString().padStart(2, '0')}</strong>
                <p>
                  {s.label === 'Alınan teklif' && count('offer') > 0 ? (
                    <span className="stat-positive">
                      <ArrowUp size={12} />
                      Tebrikler!{' '}
                    </span>
                  ) : null}
                  {s.sub}
                </p>
              </div>
            ))}
          </div>
          {page === 'board' && (
            <>
              <section className="board-section">
                <div className="section-top">
                  <div className="section-tabs">
                    <h2>Başvuru panosu</h2>
                  </div>
                  <div className="view-switch" aria-label="Görünüm">
                    <button
                      aria-label="Pano görünümü"
                      className={view === 'board' ? 'selected' : ''}
                      onClick={() => setView('board')}
                    >
                      <Columns3 size={16} />
                      Pano
                    </button>
                    <button
                      aria-label="Liste görünümü"
                      className={view === 'list' ? 'selected' : ''}
                      onClick={() => setView('list')}
                    >
                      <List size={16} />
                      Liste
                    </button>
                  </div>
                </div>
                <div className="board-toolbar">
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Başvurularda ara"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Şirket veya pozisyon ara…"
                    />
                    {query && (
                      <button onClick={() => setQuery('')} aria-label="Aramayı temizle">
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <div className="toolbar-right">
                    <label className="filter-label">
                      <Settings2 size={15} />
                      <select
                        aria-label="Çalışma şekline göre filtrele"
                        value={work}
                        onChange={(e) => setWork(e.target.value)}
                      >
                        <option value="all">Tüm çalışma şekilleri</option>
                        {['Uzaktan', 'Hibrit', 'Ofiste'].map((w) => (
                          <option key={w}>{w}</option>
                        ))}
                      </select>
                    </label>
                    <button className="text-button export-button" onClick={exportData}>
                      <Download size={16} />
                      Dışa aktar
                    </button>
                  </div>
                </div>
                {view === 'board' ? (
                  <div className="kanban">
                    {stages
                      .filter((s) => s !== 'rejected' || showRejected)
                      .map((s) => (
                        <section
                          key={s}
                          className={`kanban-column stage-${s} ${drop === s ? 'drop-active' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDrop(s);
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const id = e.dataTransfer.getData('text/plain');
                            if (apps.some((a) => a.id === id)) {
                              void commit(
                                (prev) => moveApplication(prev, id, s),
                                `Başvuru “${labels[s]}” aşamasına taşındı.`,
                              );
                            }
                            setDrop(null);
                          }}
                        >
                          <div className="column-heading">
                            <span className="stage-dot" />
                            <h3>{labels[s]}</h3>
                            <span className="column-count">
                              {filtered.filter((a) => a.stage === s).length}
                            </span>
                            <button
                              aria-label={`${labels[s]} aşamasına başvuru ekle`}
                              onClick={() => setDialog({ item: null, stage: s })}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <div className="card-stack">
                            {filtered
                              .filter((a) => a.stage === s)
                              .map((a) => (
                                <ApplicationCard key={a.id} item={a} onOpen={() => open(a)} />
                              ))}
                            {!filtered.some((a) => a.stage === s) && (
                              <div className="empty-column">
                                <BriefcaseBusiness size={23} />
                                <p>
                                  {query || work !== 'all'
                                    ? 'Eşleşen başvuru yok'
                                    : 'Yeni fırsatlara yer var'}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            className="column-add"
                            onClick={() => setDialog({ item: null, stage: s })}
                          >
                            <Plus size={15} />
                            Başvuru ekle
                          </button>
                        </section>
                      ))}
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Şirket ve pozisyon</th>
                          <th>Aşama</th>
                          <th>Çalışma şekli</th>
                          <th>Tarih</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <button className="table-company" onClick={() => open(a)}>
                                <span className="company-mark" style={{ background: a.color }}>
                                  {a.company[0]}
                                </span>
                                <span>
                                  <strong>{a.company}</strong>
                                  <small>{a.role}</small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className={`stage-label stage-${a.stage}`}>
                                {labels[a.stage]}
                              </span>
                            </td>
                            <td>{a.workType}</td>
                            <td>{new Date(a.date + 'T12:00').toLocaleDateString('tr-TR')}</td>
                            <td>
                              <button
                                className="icon-button"
                                onClick={() => open(a)}
                                aria-label={`${a.company} düzenle`}
                              >
                                <ArrowUpRight size={18} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filtered.length && (
                      <div className="empty-state">Eşleşen başvuru bulunamadı.</div>
                    )}
                  </div>
                )}
                <div className="board-foot">
                  <span>
                    <span className="tiny-dot" />
                    Bir kartı açarak düzenle veya sürükleyerek aşamasını değiştir.
                  </span>
                  <button className="text-button" onClick={() => setShowRejected(!showRejected)}>
                    {showRejected
                      ? 'Olumsuzları gizle'
                      : `Olumsuzları göster (${count('rejected')})`}
                  </button>
                </div>
              </section>
              <div className="bottom-grid">
                <section className="upcoming-panel">
                  <div className="panel-heading">
                    <h2>
                      <CalendarDays size={17} />
                      Sıradaki görüşmen
                    </h2>
                    <button className="text-button" onClick={() => changePage('calendar')}>
                      Takvime git
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {upcoming[0] ? (
                    <button className="next-meeting" onClick={() => open(upcoming[0])}>
                      <span className="meeting-date">
                        <strong>{new Date(upcoming[0].interviewAt).getDate()}</strong>
                        {new Date(upcoming[0].interviewAt).toLocaleDateString('tr-TR', {
                          month: 'short',
                        })}
                      </span>
                      <span>
                        <strong>{upcoming[0].company}</strong>
                        <small>{upcoming[0].role}</small>
                      </span>
                      <span className="meeting-time">
                        {new Date(upcoming[0].interviewAt).toLocaleTimeString('tr-TR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        <small>Yerel saat</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ) : (
                    <p className="muted">Planlanmış bir görüşmen yok. Yeni fırsatlara hazır ol.</p>
                  )}
                </section>
                <section className="motivation">
                  <span>
                    <Sparkles size={21} />
                  </span>
                  <div>
                    <h3>Doğru fırsat, bir başvuru uzağında.</h3>
                    <p>Bugün attığın küçük bir adım yarın her şeyi değiştirebilir.</p>
                  </div>
                  <span className="motivation-art">↗</span>
                </section>
              </div>
            </>
          )}
          {page === 'calendar' && (
            <section className="calendar-panel">
              <div className="panel-heading">
                <h2>{month.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</h2>
                <div className="calendar-controls">
                  <button
                    className="icon-button"
                    aria-label="Önceki ay"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() =>
                      setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
                    }
                  >
                    Bugün
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Sonraki ay"
                    onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="calendar-scroll">
                <div className="calendar-grid">
                  {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
                    <div className="weekday" key={d}>
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: 42 }, (_, i) => {
                    const start = (month.getDay() + 6) % 7;
                    const d = new Date(month.getFullYear(), month.getMonth(), i - start + 1);
                    const date = localDate(d);
                    return (
                      <div
                        key={date}
                        className={`calendar-day ${d.getMonth() !== month.getMonth() ? 'outside' : ''} ${date === localDate() ? 'today' : ''}`}
                      >
                        <span className="day-number">{d.getDate()}</span>
                        {meetings
                          .filter((a) => a.interviewAt.slice(0, 10) === date)
                          .map((a) => (
                            <button key={a.id} className="calendar-event" onClick={() => open(a)}>
                              {a.company}
                              <small>{a.interviewAt.slice(11, 16)}</small>
                            </button>
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="calendar-note">
                Mülakat aşamasındaki ve tarih atanmış başvurular gösterilir. Tarih eklemek için
                başvuru ayrıntılarını aç.
              </p>
              {!meetings.length && (
                <div className="empty-state">Henüz planlanmış mülakatın yok.</div>
              )}
            </section>
          )}
          {page === 'stats' && (
            <>
              <ApplicationSankey
                applications={apps}
                onCreate={() => setDialog({ item: null, stage: 'saved' })}
              />
              <div className="analytics-grid">
                <section className="analytics-panel">
                  <h2>Başvuru dağılımı</h2>
                  <p className="muted">Başvurularının mevcut aşamalarına göre dağılımı.</p>
                  {stages.map((s) => (
                    <div className={`distribution stage-${s}`} key={s}>
                      <div>
                        <span>{labels[s]}</span>
                        <strong>{count(s)}</strong>
                      </div>
                      <div className="bar-track">
                        <div
                          style={{ width: `${apps.length ? (count(s) / apps.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </section>
                <section className="analytics-panel">
                  <span className="analytics-symbol">
                    <Target size={32} />
                  </span>
                  <h2>Olumlu süreç oranı</h2>
                  <div className="rate-value">%{rate}</div>
                  <p className="muted">
                    Mülakat ve teklif aşamasındaki kayıtların, kaydedilenler dışındaki tüm kayıtlara
                    oranı.
                  </p>
                  <div className="formula">
                    {count('interview') + count('offer')} olumlu süreç / {applied} gönderilen
                    başvuru
                  </div>
                  <p className="field-help">
                    Bu oran mevcut aşamalardan hesaplanır; geçmiş aşama geçişlerini ölçmez.
                  </p>
                </section>
              </div>
            </>
          )}
          {page === 'settings' && (
            <div className="settings-grid">
              <AccountSettings user={user} />
              <section className="settings-panel">
                <h2>Verilerin yanında olsun.</h2>
                <p className="muted">
                  Başvuruların hesabına bağlı olarak sunucunun veritabanında saklanır. Aynı sunucuya
                  farklı cihazlardan giriş yaparak erişebilirsin. JSON dosyasıyla ayrıca yedek
                  alabilirsin.
                </p>
                <div className="settings-actions">
                  <button className="button primary" onClick={exportData}>
                    <Download size={17} />
                    Yedek indir
                  </button>
                  <button className="button secondary" onClick={() => fileRef.current?.click()}>
                    <Upload size={17} />
                    Yedek içe aktar
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(e) => void importData(e.target.files?.[0])}
                  />
                </div>
                <p className="field-help">
                  İçe aktarılan kayıtlar mevcut başvurularla birleştirilir. Aynı kimlikteki kayıtlar
                  yedekteki sürümle güncellenir.
                </p>
                {legacy && (
                  <div className="legacy-import">
                    <h3>Eski tarayıcı kayıtların bulundu</h3>
                    <p className="muted">
                      Bu cihazda {legacy.length} eski kayıt var. Yalnızca sana ait olduklarından
                      eminsen {user.email} hesabına aktar. Örnek kayıtlar da aktarılır.
                    </p>
                    <label className="import-consent">
                      <input
                        type="checkbox"
                        checked={importLegacy}
                        onChange={(e) => setImportLegacy(e.target.checked)}
                      />
                      Bu kayıtları kendi hesabıma aktarmak istiyorum.
                    </label>
                    <button
                      className="button secondary"
                      disabled={!importLegacy || pending}
                      onClick={() =>
                        void commit(
                          (prev) => {
                            const map = new Map(prev.map((a) => [a.id, a]));
                            legacy.forEach((a) => {
                              if (!map.has(a.id)) map.set(a.id, a);
                            });
                            return [...map.values()];
                          },
                          'Tarayıcı kayıtların hesabına aktarıldı.',
                          () => {
                            setLegacy(null);
                            setImportLegacy(false);
                          },
                        )
                      }
                    >
                      Kayıtları hesabıma aktar
                    </button>
                    <p className="field-help">
                      Aktarım mevcut hesap kayıtlarını ezmez; tarayıcıdaki eski kopya korunur.
                    </p>
                  </div>
                )}
              </section>
              <section className="settings-panel">
                <h2>Yeni bir sayfa aç.</h2>
                <p className="muted">
                  {demo
                    ? 'Örnek şirketler ve başvurular tanıtım amaçlıdır. Kendi başvurularını eklemeye başladığında örnekleri kaldırabilirsin.'
                    : 'Kendi fırsatlarını takip ediyorsun. Verilerini silmeden önce yedek alabilirsin.'}
                </p>
                {demo && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      void commit(
                        (prev) => prev.filter((a) => !a.id.startsWith('demo-')),
                        'Örnek kayıtlar kaldırıldı.',
                      );
                    }}
                  >
                    Yalnızca örnek kayıtları kaldır
                  </button>
                )}
                <div className="clear-data">
                  {confirmClear ? (
                    <>
                      <p>Tüm başvurular kalıcı olarak silinecek.</p>
                      <button
                        className="button danger"
                        onClick={() => {
                          void commit([], 'Tüm başvurular silindi.', () => setConfirmClear(false));
                        }}
                      >
                        Tümünü sil
                      </button>
                      <button className="button secondary" onClick={() => setConfirmClear(false)}>
                        Vazgeç
                      </button>
                    </>
                  ) : (
                    <button className="delete-button" onClick={() => setConfirmClear(true)}>
                      Tüm başvuruları sil
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>Bir sonraki adımın için tasarlandı.</span>
            <span>
              applyflow <span className="footer-dot">✳</span>{' '}
              {demo ? 'Örnek veriler içerir' : 'Senin yolculuğun'}
            </span>
          </footer>
        </main>
      </div>
      {dialog && (
        <ApplicationDialog
          item={dialog.item}
          initialStage={dialog.stage}
          onClose={() => setDialog(null)}
          busy={pending}
          error={dialogError}
          onSave={(a) => {
            void commit(
              (prev) =>
                prev.some((x) => x.id === a.id)
                  ? prev.map((x) => (x.id === a.id ? a : x))
                  : [...prev, a],
              'Başvuru kaydedildi.',
              () => setDialog(null),
            );
          }}
          onDelete={(id) => {
            void commit(
              (prev) => prev.filter((a) => a.id !== id),
              'Başvuru silindi.',
              () => setDialog(null),
            );
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Bildirimi kapat">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
