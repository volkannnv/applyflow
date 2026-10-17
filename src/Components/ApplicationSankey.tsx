import { useId, useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import type { Application, Stage } from '../Interfaces/application';
import { buildSankey, ribbonPath } from '../lib/sankey';

export default function ApplicationSankey({
  applications,
  onCreate,
}: {
  applications: Application[];
  onCreate: () => void;
}) {
  const id = useId().replaceAll(':', '');
  const [selected, setSelected] = useState<Stage | null>(null);
  const [hovered, setHovered] = useState<Stage | null>(null);
  const graph = buildSankey(applications);
  const active = hovered ?? selected;
  const detail = graph.flows.find((flow) => flow.stage === active);
  const percentage = (count: number) =>
    new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(
      graph.total ? (count / graph.total) * 100 : 0,
    );
  const toggle = (stage: Stage) => setSelected((prev) => (prev === stage ? null : stage));
  return (
    <section className="sankey-panel" aria-labelledby={`${id}-heading`}>
      <div className="sankey-heading">
        <div>
          <p className="eyebrow">FIRSATLARININ GÖRÜNÜMÜ</p>
          <h2 id={`${id}-heading`}>Başvuru akışı</h2>
          <p>Başvurularının şu anda hangi aşamalarda olduğunu keşfet.</p>
        </div>
        <span className="sankey-type">
          <GitBranch size={15} />
          Sankey diyagramı
        </span>
      </div>
      {graph.total > 0 ? (
        <>
          <div
            className="sankey-scroll"
            tabIndex={0}
            aria-label="Başvuru akışı grafiği; dar ekranlarda yatay kaydırılabilir"
          >
            <svg
              className="sankey-chart"
              viewBox="0 0 800 480"
              role="group"
              aria-labelledby={`${id}-title ${id}-description`}
            >
              <title id={`${id}-title`}>{graph.total} başvurunun mevcut aşamalara dağılımı</title>
              <desc id={`${id}-description`}>
                Akış kalınlıkları başvuru sayısıyla orantılıdır. Bu grafik aşama geçiş geçmişini
                göstermez. Bir aşamayı seçerek akışını vurgulayabilirsin.
              </desc>
              <defs>
                {graph.flows.map((flow) => (
                  <linearGradient
                    id={`${id}-${flow.stage}`}
                    key={flow.stage}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#76a391" />
                    <stop offset="100%" stopColor={flow.color} />
                  </linearGradient>
                ))}
              </defs>
              {graph.flows.map((flow) => (
                <path
                  key={flow.stage}
                  d={ribbonPath(flow.sourceY, flow.targetY, flow.thickness)}
                  fill={`url(#${id}-${flow.stage})`}
                  opacity={active && active !== flow.stage ? 0.14 : 0.42}
                  className="sankey-ribbon"
                  onMouseEnter={() => setHovered(flow.stage)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => toggle(flow.stage)}
                >
                  <title>{`Tüm başvurular → ${flow.label}: ${flow.count} başvuru (%${percentage(flow.count)})`}</title>
                </path>
              ))}
              <rect
                x={34}
                y={graph.sourceY}
                width={16}
                height={graph.flowHeight}
                rx={3}
                fill="#347d64"
              />
              <text x={34} y={graph.sourceY - 33} className="sankey-total">
                {graph.total}
              </text>
              <text x={34} y={graph.sourceY - 13} className="sankey-source-label">
                Tüm başvurular
              </text>
              {graph.flows.map((flow) => (
                <g
                  key={flow.stage}
                  role="button"
                  tabIndex={0}
                  aria-label={`${flow.label}: ${flow.count} başvuru, yüzde ${percentage(flow.count)}`}
                  aria-pressed={selected === flow.stage}
                  className={`sankey-node ${active && active !== flow.stage ? 'is-muted' : ''}`}
                  onMouseEnter={() => setHovered(flow.stage)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => toggle(flow.stage)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggle(flow.stage);
                    }
                  }}
                >
                  <rect
                    className="sankey-focus-ring"
                    x={565}
                    y={flow.targetY + flow.thickness / 2 - 25}
                    width={218}
                    height={50}
                    rx={6}
                    fill="none"
                  />
                  <rect
                    x={574}
                    y={flow.targetY}
                    width={16}
                    height={flow.thickness}
                    rx={Math.min(3, flow.thickness / 2)}
                    fill={flow.color}
                  />
                  <text x={608} y={flow.targetY + flow.thickness / 2 - 2} className="sankey-value">
                    {flow.count}
                    <tspan className="sankey-percent" dx={9}>
                      %{percentage(flow.count)}
                    </tspan>
                  </text>
                  <text
                    x={608}
                    y={flow.targetY + flow.thickness / 2 + 18}
                    className="sankey-node-label"
                  >
                    {flow.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="sankey-legend" aria-label="Aşamaya göre akışı vurgula">
            {graph.counts.map((item) => (
              <button
                type="button"
                key={item.stage}
                disabled={!item.count}
                aria-pressed={selected === item.stage}
                className={selected === item.stage ? 'is-selected' : ''}
                onClick={() => toggle(item.stage)}
              >
                <span style={{ background: item.color }} />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>
          <div className="sankey-detail" role="status">
            <span
              className="sankey-detail-dot"
              style={{ background: detail?.color ?? '#347d64' }}
            />
            {detail ? (
              <span>
                <strong>{detail.label}</strong> aşamasında {detail.count} başvuru · Tüm kayıtlarının
                %{percentage(detail.count)}’i
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setHovered(null);
                  }}
                >
                  Vurguyu kaldır
                </button>
              </span>
            ) : (
              <span>Ayrıntıları görmek için bir akışın üzerine gel veya bir aşama seç.</span>
            )}
          </div>
        </>
      ) : (
        <div className="sankey-empty">
          <span>
            <GitBranch size={30} />
          </span>
          <h3>Akışın ilk başvurunla başlayacak.</h3>
          <p>Başvurularını ekledikçe aşamalar arasındaki dağılım burada şekillenecek.</p>
          <button className="button secondary" type="button" onClick={onCreate}>
            <Plus size={16} />
            İlk başvurunu ekle
          </button>
        </div>
      )}
      <p className="sankey-note">
        Mevcut aşamalar gösterilir; mülakat turları veya geçmiş aşama geçişleri bu grafiğe dahil
        değildir. Her başvuru yalnızca bir kez sayılır.
      </p>
    </section>
  );
}
