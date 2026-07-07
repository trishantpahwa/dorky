import { useState, useEffect, useRef } from 'react';
import './CommunityStats.css';

const REPO = 'trishantpahwa/dorky';
const EPIC_ISSUE_NUMBER = 66;
const CACHE_TTL_MS = 10 * 60 * 1000; // GitHub's unauthenticated API allows 60 req/hr per IP — cache aggressively so repeat visits don't burn it

const compactFormatter = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function formatCompact(n) {
  return typeof n === 'number' ? compactFormatter.format(n) : null;
}

function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diffSec = Math.round((new Date(dateStr).getTime() - Date.now()) / 1000);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, secs] of units) {
    if (Math.abs(diffSec) >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(diffSec, 'second');
}

function readCacheEntry(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCacheEntry(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ value, ts: Date.now() }));
  } catch {
    /* localStorage unavailable (private mode/full) — skip caching */
  }
}

// Stale-while-revalidate-ish: serve fresh cache instantly, refetch in the background once stale,
// and fall back to a stale cache entry (rather than nothing) if the network call fails.
async function fetchJsonCached(key, url) {
  const cached = readCacheEntry(key);
  if (cached && Date.now() - cached.ts <= CACHE_TTL_MS) return cached.value;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    const json = await res.json();
    writeCacheEntry(key, json);
    return json;
  } catch (err) {
    if (cached) return cached.value;
    throw err;
  }
}

function parseChecklist(body) {
  if (!body) return null;
  const matches = body.match(/- \[([ xX])\]/g);
  if (!matches || matches.length === 0) return null;
  const total = matches.length;
  const done = matches.filter((m) => /\[[xX]\]/.test(m)).length;
  return { done, total };
}

function ciRunInfo(run) {
  if (!run) return null;
  if (run.status !== 'completed') return { label: 'In progress', tone: 'warning', icon: '●' };
  if (run.conclusion === 'success') return { label: 'Passing', tone: 'good', icon: '✓' };
  if (run.conclusion === 'failure') return { label: 'Failing', tone: 'critical', icon: '✕' };
  return { label: run.conclusion || 'Unknown', tone: 'warning', icon: '●' };
}

function useGithubStats() {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const endpoints = {
        repo: `https://api.github.com/repos/${REPO}`,
        pulls: `https://api.github.com/repos/${REPO}/pulls?state=open&per_page=10&sort=created&direction=desc`,
        issues: `https://api.github.com/repos/${REPO}/issues?state=open&per_page=20&sort=created&direction=desc`,
        epic: `https://api.github.com/repos/${REPO}/issues/${EPIC_ISSUE_NUMBER}`,
        runs: `https://api.github.com/repos/${REPO}/actions/runs?per_page=3`,
        contributors: `https://api.github.com/repos/${REPO}/contributors?per_page=9`,
        npmDownloads: `https://api.npmjs.org/downloads/point/last-month/dorky`,
        npmVersion: `https://registry.npmjs.org/dorky/latest`,
      };
      const keys = Object.keys(endpoints);
      const results = await Promise.allSettled(
        keys.map((k) => fetchJsonCached(`dorky-stats-${k}`, endpoints[k]))
      );
      if (cancelled) return;

      const data = {};
      keys.forEach((k, i) => {
        data[k] = results[i].status === 'fulfilled' ? results[i].value : null;
      });

      const realIssues = (data.issues || []).filter((i) => !i.pull_request);
      const activity = [
        ...realIssues.map((i) => ({
          type: 'issue',
          number: i.number,
          title: i.title,
          html_url: i.html_url,
          created_at: i.created_at,
          user: i.user,
          labels: i.labels,
        })),
        ...(data.pulls || []).map((p) => ({
          type: 'pr',
          number: p.number,
          title: p.title,
          html_url: p.html_url,
          created_at: p.created_at,
          user: p.user,
          labels: p.labels,
        })),
      ]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);

      setState({
        loading: false,
        stars: data.repo?.stargazers_count ?? null,
        forks: data.repo?.forks_count ?? null,
        openIssuesCount: realIssues.length || null,
        openPullsCount: (data.pulls || []).length || null,
        openIssuesUrl: `https://github.com/${REPO}/issues`,
        openPullsUrl: `https://github.com/${REPO}/pulls`,
        contributors: data.contributors,
        npmDownloads: data.npmDownloads?.downloads ?? null,
        npmVersion: data.npmVersion?.version ?? null,
        roadmap: parseChecklist(data.epic?.body),
        roadmapUrl: data.epic?.html_url,
        latestRun: data.runs?.workflow_runs?.[0] ?? null,
        activity,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function usePrefersReducedMotionLocal() {
  const [reduced] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  return reduced;
}

function useCountUp(target, active, reducedMotion, duration = 1100) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target == null) return undefined;
    if (!active || reducedMotion) {
      setValue(target);
      return undefined;
    }
    let raf;
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reducedMotion, duration]);
  return value;
}

function StatTile({ icon, label, value, href, visible, reducedMotion, loading }) {
  const animated = useCountUp(value, visible, reducedMotion);
  const Tag = href ? 'a' : 'div';
  return (
    <Tag
      {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="stat-tile elevate-hover"
    >
      <div className="stat-tile-icon" aria-hidden="true">{icon}</div>
      <div>
        <div className="stat-tile-value">
          {loading ? <span className="stat-skeleton" /> : value == null ? '—' : formatCompact(animated)}
        </div>
        <div className="stat-tile-label">{label}</div>
      </div>
    </Tag>
  );
}

function RoadmapMeter({ roadmap, href }) {
  if (!roadmap) return null;
  const pct = roadmap.total ? Math.round((roadmap.done / roadmap.total) * 100) : 0;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="roadmap-meter elevate-hover">
      <div className="roadmap-meter-head">
        <span>🚀 Roadmap progress</span>
        <span className="roadmap-meter-count">{roadmap.done} / {roadmap.total} issues shipped</span>
      </div>
      <div className="roadmap-meter-track">
        <div className="roadmap-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </a>
  );
}

function LatestRunPill({ run }) {
  const info = ciRunInfo(run);
  if (!info) return null;
  return (
    <a href={run.html_url} target="_blank" rel="noopener noreferrer" className={`run-pill run-pill-${info.tone}`}>
      <span className="run-pill-icon">{info.icon}</span>
      <span>
        {run.name} <span className="run-pill-muted">· {info.label} · {run.head_branch} · {relativeTime(run.created_at)}</span>
      </span>
    </a>
  );
}

function ContributorStack({ contributors }) {
  if (!contributors || contributors.length === 0) return null;
  const shown = contributors.slice(0, 8);
  const extra = contributors.length - shown.length;
  return (
    <div className="contributor-stack">
      {shown.map((c) => (
        <a
          key={c.login}
          href={c.html_url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${c.login} · ${c.contributions} commits`}
          className="contributor-avatar"
        >
          <img src={c.avatar_url} alt={c.login} loading="lazy" />
        </a>
      ))}
      {extra > 0 && <span className="contributor-avatar contributor-avatar-extra">+{extra}</span>}
    </div>
  );
}

function ActivityFeed({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="activity-feed">
      {items.map((item) => (
        <li key={`${item.type}-${item.number}`} className="activity-item">
          <span className={`activity-icon activity-icon-${item.type}`} aria-hidden="true">
            {item.type === 'pr' ? '🔀' : '🐛'}
          </span>
          <div className="activity-body">
            <a href={item.html_url} target="_blank" rel="noopener noreferrer" className="activity-title">
              #{item.number} {item.title}
            </a>
            <div className="activity-meta">
              {relativeTime(item.created_at)}
              {item.user?.login ? ` · by ${item.user.login}` : ''}
              {(item.labels || []).slice(0, 2).map((l) => (
                <span key={l.name} className="activity-label">
                  <span className="activity-label-dot" style={{ backgroundColor: `#${l.color}` }} />
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CommunityStats() {
  const stats = useGithubStats();
  const reducedMotion = usePrefersReducedMotionLocal();
  const sectionRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sectionRef}>
      <div className="stat-tile-grid">
        <StatTile icon="⭐" label="GitHub stars" value={stats.stars} href={`https://github.com/${REPO}`} visible={visible} reducedMotion={reducedMotion} loading={stats.loading} />
        <StatTile icon="🍴" label="Forks" value={stats.forks} href={`https://github.com/${REPO}/forks`} visible={visible} reducedMotion={reducedMotion} loading={stats.loading} />
        <StatTile icon="📦" label="npm downloads / mo" value={stats.npmDownloads} href="https://www.npmjs.com/package/dorky" visible={visible} reducedMotion={reducedMotion} loading={stats.loading} />
        <StatTile icon="👥" label="Contributors" value={stats.contributors?.length} href={`https://github.com/${REPO}/graphs/contributors`} visible={visible} reducedMotion={reducedMotion} loading={stats.loading} />
      </div>

      <div className="community-row">
        <LatestRunPill run={stats.latestRun} />
        {stats.npmVersion && (
          <a
            className="npm-version-pill"
            href="https://www.npmjs.com/package/dorky"
            target="_blank"
            rel="noopener noreferrer"
          >
            📦 v{stats.npmVersion} on npm
          </a>
        )}
      </div>

      <RoadmapMeter roadmap={stats.roadmap} href={stats.roadmapUrl} />

      <div className="community-grid">
        <div>
          <p className="community-subheading">
            🐛 <a href={stats.openIssuesUrl} target="_blank" rel="noopener noreferrer">{stats.openIssuesCount ?? '—'} open issues</a>
            {' · '}
            🔀 <a href={stats.openPullsUrl} target="_blank" rel="noopener noreferrer">{stats.openPullsCount ?? '—'} open PRs</a>
          </p>
          <ActivityFeed items={stats.activity} />
        </div>
        <div>
          <p className="community-subheading">Contributors</p>
          <ContributorStack contributors={stats.contributors} />
          <a
            className="hero-btn hero-btn-secondary mt-3 inline-flex"
            href={`https://github.com/${REPO}/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22`}
            target="_blank"
            rel="noopener noreferrer"
          >
            🙌 Find a good first issue
          </a>
        </div>
      </div>
    </div>
  );
}

export default CommunityStats;
