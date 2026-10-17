import { useEffect, useRef, useState } from 'react';
import { X, Trash2, ArrowUpRight } from 'lucide-react';
import type { Application, Stage } from '../Interfaces/application';
import { labels, stages } from '../Interfaces/application';
import { localDate, safeUrl } from '../lib/model';
interface Props {
  item: Application | null;
  initialStage: Stage;
  onClose: () => void;
  onSave: (a: Application) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
  error?: string;
}
export default function ApplicationDialog({
  item,
  initialStage,
  onClose,
  onSave,
  onDelete,
  busy = false,
  error = '',
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<Application>(
    item ?? {
      id: crypto.randomUUID(),
      company: '',
      role: '',
      location: '',
      workType: 'Uzaktan',
      stage: initialStage,
      date: localDate(),
      interviewAt: '',
      url: '',
      notes: '',
      color: '#287565',
    },
  );
  const [deleting, setDeleting] = useState(false);
  const set = (key: keyof Application, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="application-dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (!busy && e.target === ref.current) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          const fields = new FormData(e.currentTarget);
          onSave({
            ...form,
            date: String(fields.get('date')),
            interviewAt: String(fields.get('interviewAt')),
            company: form.company.trim(),
            role: form.role.trim(),
          });
        }}
      >
        <fieldset className="dialog-fields" disabled={busy}>
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">KARİYER YOLCULUĞUN</span>
              <h2>{item ? 'Başvuru ayrıntıları' : 'Yeni bir fırsat ekle'}</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Kapat" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
          <div className="form-grid">
            <label>
              Şirket
              <input
                autoFocus
                required
                maxLength={80}
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="Örn. Figma"
                pattern=".*\S.*"
              />
            </label>
            <label>
              Pozisyon
              <input
                required
                maxLength={120}
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                placeholder="Örn. Frontend Developer"
                pattern=".*\S.*"
              />
            </label>
            <label>
              Konum
              <input
                maxLength={100}
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                placeholder="Örn. İstanbul"
              />
            </label>
            <label>
              Çalışma şekli
              <select
                aria-label="Çalışma şekli"
                value={form.workType}
                onChange={(e) => set('workType', e.target.value)}
              >
                {['Uzaktan', 'Hibrit', 'Ofiste'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Aşama
              <select
                aria-label="Aşama"
                value={form.stage}
                onChange={(e) => set('stage', e.target.value)}
              >
                {stages.map((s) => (
                  <option value={s} key={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kayıt / başvuru tarihi
              <input
                name="date"
                type="date"
                required
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
            </label>
            <label className="span-2">
              Mülakat tarihi ve saati
              <input
                name="interviewAt"
                type="datetime-local"
                value={form.interviewAt}
                onChange={(e) => set('interviewAt', e.target.value)}
              />
              <span className="field-help">
                Mülakat aşamasındaki kayıtlar takvimde görünür. Saatler cihazının yerel saatidir.
              </span>
            </label>
            <label className="span-2">
              İlan bağlantısı
              <div className="url-field">
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => set('url', e.target.value)}
                  placeholder="https://…"
                />
                {safeUrl(form.url) && (
                  <a
                    href={safeUrl(form.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="İlanı aç"
                  >
                    <ArrowUpRight size={20} />
                  </a>
                )}
              </div>
            </label>
            <label className="span-2">
              Notların
              <textarea
                rows={4}
                maxLength={6000}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="İlan ayrıntıları, görüşme notları, hazırlanacağın konular…"
              />
            </label>
          </div>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="success-message" role="status">
              Kaydediliyor…
            </p>
          )}
          {deleting ? (
            <div className="delete-confirm">
              <p>Bu başvuru kalıcı olarak silinsin mi?</p>
              <button type="button" className="button danger" onClick={() => onDelete(form.id)}>
                Evet, sil
              </button>
              <button type="button" className="button secondary" onClick={() => setDeleting(false)}>
                Vazgeç
              </button>
            </div>
          ) : (
            <div className="dialog-footer">
              {item && (
                <button type="button" className="delete-button" onClick={() => setDeleting(true)}>
                  <Trash2 size={16} /> Sil
                </button>
              )}
              <div className="footer-actions">
                <button type="button" className="button secondary" onClick={onClose}>
                  Vazgeç
                </button>
                <button className="button primary" type="submit">
                  {item ? 'Değişiklikleri kaydet' : 'Başvuruyu ekle'}
                </button>
              </div>
            </div>
          )}
        </fieldset>
      </form>
    </dialog>
  );
}
