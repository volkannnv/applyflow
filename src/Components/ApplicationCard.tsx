import { MapPin, CalendarDays, ArrowUpRight } from 'lucide-react';
import type { Application } from '../Interfaces/application';
export default function ApplicationCard({
  item,
  onOpen,
}: {
  item: Application;
  onOpen: () => void;
}) {
  return (
    <button
      className="application-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onOpen}
      aria-label={`${item.company}, ${item.role}, ayrıntıları aç`}
    >
      <div className="card-top">
        <span className="company-mark" style={{ background: item.color }}>
          {item.company.slice(0, 1)}
        </span>
        <span className="card-company">{item.company}</span>
        <ArrowUpRight size={16} className="card-arrow" />
      </div>
      <h3>{item.role}</h3>
      <p className="card-location">
        <MapPin size={12} />
        {item.location || 'Konum belirtilmedi'}
      </p>
      <span className={`work-tag ${item.workType === 'Uzaktan' ? 'remote' : ''}`}>
        {item.workType}
      </span>
      <div className="card-bottom">
        <span>
          {new Date(item.date + 'T12:00').toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
          })}
        </span>
        {item.stage === 'interview' && item.interviewAt ? (
          <span className="meeting-tag">
            <CalendarDays size={12} />
            {new Date(item.interviewAt).toLocaleDateString('tr-TR', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        ) : (
          <span className="note-indicator">{item.notes ? 'Not eklendi' : 'Ayrıntıları aç'}</span>
        )}
      </div>
    </button>
  );
}
