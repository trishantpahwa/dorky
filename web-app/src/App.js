import { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import './App.css';
import CommunityStats from './CommunityStats';

/* -------------------- hooks -------------------- */

function matchMediaSafe(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { matches: false, addEventListener: () => {}, removeEventListener: () => {} };
  }
  return window.matchMedia(query);
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMediaSafe('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = matchMediaSafe('(prefers-reduced-motion: reduce)');
    const handler = (e) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function useTheme() {
  const [theme, setTheme] = useState(() => {
    const stored = typeof window !== 'undefined' && localStorage.getItem('dorky-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return matchMediaSafe('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('dorky-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return [theme, toggleTheme];
}

function useActiveSection(ids) {
  const [activeId, setActiveId] = useState(ids[0]);
  useEffect(() => {
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
          setActiveId(topMost.target.id);
        }
      },
      { rootMargin: '-90px 0px -70% 0px', threshold: 0 }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return activeId;
}

/* -------------------- scroll progress + reveal -------------------- */

function ScrollProgress() {
  const barRef = useRef(null);
  useEffect(() => {
    let ticking = false;
    const update = () => {
      const scrollTop = window.scrollY;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = height > 0 ? scrollTop / height : 0;
      if (barRef.current) barRef.current.style.transform = `scaleX(${ratio})`;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);
  return (
    <div className="scroll-progress-track">
      <div ref={barRef} className="scroll-progress-bar" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}

function Reveal({ children, className = '' }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}>
      {children}
    </div>
  );
}

/* -------------------- small UI primitives -------------------- */

function Heading({ as: Tag = 'h2', id, className = '', children }) {
  return (
    <Tag id={id} className={`group scroll-mt-24 ${className}`}>
      {children}
      <a href={`#${id}`} className="heading-anchor" aria-label="Link to section">#</a>
    </Tag>
  );
}

function CodeBlock({ lang, children }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(children));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore silently */
    }
  };

  return (
    <div className="relative my-4">
      {lang && (
        <span className="absolute right-3 top-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {lang}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className={`copy-btn ${lang ? 'copy-btn-with-lang' : ''} ${copied ? 'copied' : ''}`}
        aria-label="Copy code to clipboard"
      >
        {copied ? '✓ copied' : 'copy'}
      </button>
      <pre><code>{children}</code></pre>
    </div>
  );
}

function Callout({ type = 'info', title, children }) {
  const styles =
    type === 'warn'
      ? { bg: 'var(--callout-warn-bg)', border: 'var(--callout-warn-border)', icon: '⚠' }
      : { bg: 'var(--callout-info-bg)', border: 'var(--callout-info-border)', icon: 'ℹ' };
  return (
    <div
      className="my-5 rounded-lg border-l-4 p-4"
      style={{ backgroundColor: styles.bg, borderLeftColor: styles.border }}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-6">{styles.icon}</span>
        <div>
          {title && <div className="font-semibold mb-1">{title}</div>}
          <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Tabs({ tabs }) {
  const [active, setActive] = useState(0);
  return (
    <div className="my-4 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 overflow-x-auto">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-sm whitespace-nowrap transition ${
              i === active
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px font-medium'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4 bg-white dark:bg-slate-950/40">{tabs[active].content}</div>
    </div>
  );
}

function Badge({ children, color = 'blue' }) {
  const map = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
    slate: 'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${map[color]}`}>
      {children}
    </span>
  );
}

/* -------------------- TOC structure -------------------- */

const tocGroups = [
  {
    title: 'Get started',
    items: [
      { id: 'introduction', label: 'Introduction' },
      { id: 'installation', label: 'Installation' },
      { id: 'quick-start', label: 'Quick start' },
      { id: 'prerequisites', label: 'Prerequisites' },
    ],
  },
  {
    title: 'Community',
    items: [{ id: 'community', label: 'Live stats' }],
  },
  {
    title: 'Core concepts',
    items: [
      { id: 'how-it-works', label: 'How it works' },
      { id: 'project-layout', label: 'Project layout' },
      { id: 'history-and-checkout', label: 'History & checkout' },
      { id: 'dorkyignore', label: '.dorkyignore' },
    ],
  },
  {
    title: 'CLI reference',
    items: [
      { id: 'cli-overview', label: 'Overview' },
      { id: 'cli-init', label: 'init' },
      { id: 'cli-list', label: 'list' },
      { id: 'cli-add-rm', label: 'add / rm' },
      { id: 'cli-push-pull', label: 'push / pull' },
      { id: 'cli-log-checkout', label: 'log / checkout' },
      { id: 'cli-destroy', label: 'destroy' },
    ],
  },
  {
    title: 'VS Code extension',
    items: [
      { id: 'vscode-overview', label: 'Overview' },
      { id: 'vscode-install', label: 'Install' },
      { id: 'vscode-commands', label: 'Commands' },
    ],
  },
  {
    title: 'MCP server',
    items: [
      { id: 'mcp-overview', label: 'Overview' },
      { id: 'mcp-tools', label: 'Tools' },
      { id: 'mcp-configure', label: 'Configure' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'env-vars', label: 'Environment variables' },
      { id: 'security', label: 'Security best practices' },
      { id: 'troubleshooting', label: 'Troubleshooting' },
      { id: 'resources', label: 'Resources' },
    ],
  },
];

const allSectionIds = tocGroups.flatMap((g) => g.items.map((it) => it.id));

/* -------------------- layout -------------------- */

function Topbar({ onMenuToggle, theme, onToggleTheme }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-white/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
      <ScrollProgress />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Toggle navigation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <a href="#introduction" className="flex items-center gap-2">
            <span className="font-bold text-lg text-blue-600 dark:text-blue-400">Dorky</span>
            <Badge color="slate">docs</Badge>
          </a>
        </div>
        <nav className="flex items-center gap-1 text-sm">
          <a className="hidden sm:inline-block px-3 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
             href="https://www.npmjs.com/package/dorky" target="_blank" rel="noopener noreferrer">npm</a>
          <a className="hidden sm:inline-block px-3 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
             href="https://marketplace.visualstudio.com/items?itemName=trishantpahwa.dorky-extension"
             target="_blank" rel="noopener noreferrer">VS Code</a>
          <a className="hidden sm:inline-block px-3 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
             href="https://github.com/trishantpahwa/dorky" target="_blank" rel="noopener noreferrer">GitHub</a>
          <button
            onClick={onToggleTheme}
            className="theme-toggle"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}

function Sidebar({ open, onNavigate, activeId }) {
  return (
    <aside
      className={`${open ? 'block' : 'hidden'} lg:block fixed lg:sticky top-14 left-0 z-30 w-64 h-[calc(100vh-3.5rem)] overflow-y-auto sidebar-scroll border-r border-slate-200 dark:border-slate-800 bg-[color:var(--sidebar-bg)]`}
    >
      <nav className="py-4 pr-2">
        {tocGroups.map((g) => (
          <div key={g.title} className="mb-2">
            <div className="toc-group-title">{g.title}</div>
            <ul>
              {g.items.map((it) => (
                <li key={it.id}>
                  <a
                    href={`#${it.id}`}
                    className={`toc-link ${activeId === it.id ? 'toc-link-active' : ''}`}
                    onClick={onNavigate}
                  >
                    {it.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

/* -------------------- terminal mockup -------------------- */

const terminalScript = [
  { type: 'cmd', text: 'dorky --init aws' },
  { type: 'out', text: '✔ Initialized dorky project (aws)' },
  { type: 'cmd', text: 'dorky --add .env config.yml' },
  { type: 'out', text: '✔ Staged 2 files' },
  { type: 'cmd', text: 'dorky --push' },
  { type: 'out', text: '✔ Pushed commit a1b2c3d · 2 files' },
];

function TerminalMockup() {
  const reducedMotion = usePrefersReducedMotion();
  const [lines, setLines] = useState(() => (reducedMotion ? terminalScript : []));
  const [typedText, setTypedText] = useState('');
  const windowRef = useRef(null);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let cancelled = false;
    let lineIdx = 0;
    let charIdx = 0;
    let done = [];

    function typeNext() {
      if (cancelled) return;
      if (lineIdx >= terminalScript.length) {
        setTimeout(() => {
          if (cancelled) return;
          done = [];
          lineIdx = 0;
          charIdx = 0;
          setLines([]);
          setTypedText('');
          typeNext();
        }, 2200);
        return;
      }
      const current = terminalScript[lineIdx];
      if (current.type === 'out') {
        done = [...done, current];
        setLines(done);
        setTypedText('');
        lineIdx += 1;
        setTimeout(typeNext, 350);
        return;
      }
      charIdx += 1;
      setTypedText(current.text.slice(0, charIdx));
      if (charIdx >= current.text.length) {
        done = [...done, current];
        setLines(done);
        setTypedText('');
        lineIdx += 1;
        charIdx = 0;
        setTimeout(typeNext, 450);
      } else {
        setTimeout(typeNext, 35 + Math.random() * 35);
      }
    }

    const start = setTimeout(typeNext, 500);
    return () => {
      cancelled = true;
      clearTimeout(start);
    };
  }, [reducedMotion]);

  const handleMouseMove = (e) => {
    if (reducedMotion || !windowRef.current) return;
    const rect = windowRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const maxDeg = 6;
    windowRef.current.style.setProperty('--rx', `${(px * maxDeg * 2).toFixed(2)}deg`);
    windowRef.current.style.setProperty('--ry', `${(-py * maxDeg * 2).toFixed(2)}deg`);
  };
  const handleMouseLeave = () => {
    if (!windowRef.current) return;
    windowRef.current.style.setProperty('--rx', '0deg');
    windowRef.current.style.setProperty('--ry', '0deg');
  };

  return (
    <div className="terminal-perspective" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div ref={windowRef} className="terminal-window">
        <div className="terminal-titlebar">
          <span className="terminal-dot" style={{ background: '#ff5f56' }} />
          <span className="terminal-dot" style={{ background: '#ffbd2e' }} />
          <span className="terminal-dot" style={{ background: '#27c93f' }} />
        </div>
        <div className="terminal-body">
          {lines.map((l, i) => (
            <div key={i} className={l.type === 'out' ? 'terminal-line-out' : ''}>
              {l.type === 'cmd' && <span className="terminal-prompt">$</span>}
              {l.text}
            </div>
          ))}
          {!reducedMotion && typedText !== '' && (
            <div>
              <span className="terminal-prompt">$</span>
              {typedText}
              <span className="terminal-cursor" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------- content sections -------------------- */

function Hero() {
  const [copied, setCopied] = useState(false);

  const handleCopyInstall = async () => {
    try {
      await navigator.clipboard.writeText('npm i -g dorky');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — ignore silently */
    }
  };

  return (
    <section className="hero">
      <div className="hero-bg" aria-hidden="true" />
      <div className="hero-grid">
        <div>
          <Heading as="h1" id="introduction" className="text-5xl font-bold tracking-tight mb-4">
            Dorky
          </Heading>
          <p className="text-xl text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            <strong>DevOps Records Keeper.</strong> Track sensitive project files — <code>.env</code>,
            configs, API keys, certificates — outside git, with the same mental model you already use
            for source control.
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mb-2">
            <div className="badge-pop" style={{ animationDelay: '0ms' }}>
              <Badge color="green">git-style workflow</Badge>
            </div>
            <div className="badge-pop" style={{ animationDelay: '90ms' }}>
              <Badge color="blue">AWS S3 or Google Drive</Badge>
            </div>
            <div className="badge-pop" style={{ animationDelay: '180ms' }}>
              <Badge color="amber">MCP-ready</Badge>
            </div>
          </div>

          <div className="hero-cta-row">
            <button type="button" onClick={handleCopyInstall} className="hero-btn hero-btn-primary">
              <code className="!bg-transparent !border-0 !p-0 text-white">
                {copied ? '✓ Copied!' : 'npm i -g dorky'}
              </code>
            </button>
            <a
              className="hero-btn hero-btn-secondary"
              href="https://github.com/trishantpahwa/dorky"
              target="_blank"
              rel="noopener noreferrer"
            >
              ⭐ Star on GitHub
            </a>
          </div>

          <p className="mt-6">
            Dorky ships three surfaces against the same on-disk format: a CLI, a VS Code extension, and an
            MCP server. You can mix and match them inside the same project — staging files in your editor
            and pushing from your terminal works the way you'd expect.
          </p>

          <Callout type="info" title="Who is this for?">
            Teams that share secrets across machines without committing them. If you've ever lost an
            afternoon onboarding a new developer to a half-documented bundle of <code>.env</code>
            files, this is for you.
          </Callout>
        </div>

        <div>
          <TerminalMockup />
        </div>
      </div>
    </section>
  );
}

function CommunitySection() {
  return (
    <section>
      <Heading as="h2" id="community" className="text-3xl font-semibold mt-14 mb-4">Live stats</Heading>
      <p className="text-slate-600 dark:text-slate-400 mb-2">
        Pulled live from GitHub and npm — stars, forks, roadmap progress, and what's happening right now.
      </p>
      <CommunityStats />
    </section>
  );
}

function Installation() {
  return (
    <section>
      <Heading as="h2" id="installation" className="text-3xl font-semibold mt-14 mb-4">Installation</Heading>
      <p>Install the CLI globally:</p>
      <CodeBlock lang="bash">npm install -g dorky</CodeBlock>
      <p>Or run on demand without installing:</p>
      <CodeBlock lang="bash">npx dorky --help</CodeBlock>
      <p className="mt-4">
        After installation you have two binaries on your PATH:
      </p>
      <ul className="list-disc ml-6 my-3 space-y-1">
        <li><code>dorky</code> — the CLI you use day-to-day.</li>
        <li><code>dorky-mcp</code> — the MCP server, started by your AI assistant.</li>
      </ul>
    </section>
  );
}

function QuickStart() {
  return (
    <section>
      <Heading as="h2" id="quick-start" className="text-3xl font-semibold mt-14 mb-4">Quick start</Heading>
      <p>From inside the project you want to track:</p>
      <Tabs
        tabs={[
          {
            label: 'AWS S3',
            content: (
              <CodeBlock lang="bash">{`export AWS_ACCESS_KEY="your-access-key"
export AWS_SECRET_KEY="your-secret-key"
export AWS_REGION="us-east-1"
export BUCKET_NAME="your-bucket-name"

cd your-project
dorky --init aws
dorky --add .env config.yml
dorky --push`}</CodeBlock>
            ),
          },
          {
            label: 'Google Drive',
            content: (
              <CodeBlock lang="bash">{`# Place OAuth credentials at ./google-drive-credentials.json
cd your-project
dorky --init google-drive
# follow the OAuth flow in your browser

dorky --add .env secrets.json
dorky --push`}</CodeBlock>
            ),
          },
        ]}
      />
      <p className="mt-4">
        On another machine, after the same credentials are set up:
      </p>
      <CodeBlock lang="bash">{`git clone your-repo
cd your-repo
dorky --pull`}</CodeBlock>
    </section>
  );
}

function Prerequisites() {
  return (
    <section>
      <Heading as="h2" id="prerequisites" className="text-3xl font-semibold mt-14 mb-4">Prerequisites</Heading>

      <Heading as="h3" id="prereq-aws" className="text-xl font-semibold mt-8 mb-3">AWS S3</Heading>
      <ol className="list-decimal ml-6 space-y-1">
        <li>Create an S3 bucket.</li>
        <li>Create an IAM user with programmatic access.</li>
        <li>Attach a policy granting <code>s3:PutObject</code>, <code>s3:GetObject</code>, <code>s3:DeleteObject</code>, <code>s3:ListBucket</code> on the bucket.</li>
        <li>Export the AWS credentials as environment variables (see <a className="text-blue-600 dark:text-blue-400 hover:underline" href="#env-vars">Environment variables</a>).</li>
      </ol>
      <CodeBlock lang="json">{`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}`}</CodeBlock>

      <Heading as="h3" id="prereq-gdrive" className="text-xl font-semibold mt-8 mb-3">Google Drive</Heading>
      <ol className="list-decimal ml-6 space-y-1">
        <li>Create a Google Cloud project.</li>
        <li>Enable the Google Drive API.</li>
        <li>Download OAuth 2.0 credentials.</li>
        <li>Save them as <code>google-drive-credentials.json</code> in your project root.</li>
      </ol>
    </section>
  );
}

const awsSteps = [
  { label: 'Local file', desc: '.env, config.yml, certs — anything staged with --add.' },
  { label: 'Hash (MD5)', desc: 'Recorded in metadata.json to detect changes.' },
  { label: 'Upload to S3', desc: 'Only changed files are sent on --push.' },
  { label: 'History snapshot', desc: 'Versioned copy at .dorky-history/<commit-id>/.' },
];

const driveSteps = [
  { label: 'Local file', desc: '.env, secrets.json — anything staged with --add.' },
  { label: 'Hash (MD5)', desc: 'Recorded in metadata.json to detect changes.' },
  { label: 'OAuth upload', desc: 'Sent to Google Drive via your authorized account.' },
  { label: 'History snapshot', desc: 'Versioned copy in a .dorky-history/<commit-id>/ folder.' },
];

function StepPipeline({ steps }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
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
    <div ref={ref} className="step-pipeline">
      {steps.map((step, i) => (
        <Fragment key={step.label}>
          <div
            className={`step-card ${visible ? 'step-card-visible' : ''}`}
            style={{ transitionDelay: visible ? `${i * 110}ms` : '0ms' }}
          >
            <div className="step-index">{i + 1}</div>
            <div className="step-label">{step.label}</div>
            <div className="step-desc">{step.desc}</div>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`step-arrow ${visible ? 'step-arrow-visible' : ''}`}
              style={{ transitionDelay: visible ? `${i * 110 + 60}ms` : '0ms' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function HowItWorks() {
  return (
    <section>
      <Heading as="h2" id="how-it-works" className="text-3xl font-semibold mt-14 mb-4">How it works</Heading>
      <ol className="list-decimal ml-6 space-y-2">
        <li><strong>Initialization</strong> creates a <code>.dorky/</code> folder with metadata, credentials, and history, and updates <code>.gitignore</code> to keep credentials private.</li>
        <li><strong>File tracking</strong> maintains an MD5 hash registry of every staged file in <code>metadata.json</code>.</li>
        <li><strong>Smart uploads</strong> push only files whose hash has changed since the last commit; pushes that match the latest commit become no-ops.</li>
        <li><strong>History</strong> records each push in <code>history.json</code> and uploads a versioned snapshot to <code>&lt;project&gt;/.dorky-history/&lt;commit-id&gt;/</code>, enabling point-in-time restore via <code>--checkout</code>.</li>
        <li><strong>Security</strong> auto-detects <code>.env</code> and <code>.config</code> files when listing, and always ignores its own credentials file in git.</li>
      </ol>
      <div className="flex flex-col gap-10 my-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            AWS S3 workflow
          </p>
          <StepPipeline steps={awsSteps} />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
            Google Drive workflow
          </p>
          <StepPipeline steps={driveSteps} />
        </div>
      </div>
    </section>
  );
}

function ProjectLayout() {
  return (
    <section>
      <Heading as="h2" id="project-layout" className="text-3xl font-semibold mt-14 mb-4">Project layout</Heading>
      <p>After <code>dorky --init</code>, your project gains:</p>
      <CodeBlock lang="text">{`your-project/
├── .dorky/
│   ├── credentials.json    # Storage credentials (auto-ignored by git)
│   ├── metadata.json       # Tracked files & hashes
│   └── history.json        # Push commit history
├── .dorkyignore            # Exclusion patterns
└── .gitignore              # Updated automatically`}</CodeBlock>
      <p>
        On remote storage, each push creates a fresh snapshot at
        {' '}<code>&lt;project&gt;/.dorky-history/&lt;commit-id&gt;/</code> in addition to the
        canonical latest copy.
      </p>
    </section>
  );
}

function HistoryAndCheckout() {
  return (
    <section>
      <Heading as="h2" id="history-and-checkout" className="text-3xl font-semibold mt-14 mb-4">History & checkout</Heading>
      <p>
        Every successful <code>--push</code> records an entry in <code>history.json</code> with a
        commit ID, timestamp, and the file set in that snapshot. View the log:
      </p>
      <CodeBlock lang="bash">dorky --log</CodeBlock>
      <p>To restore an earlier state, pass the commit ID (prefix matching is supported):</p>
      <CodeBlock lang="bash">{`dorky --checkout a1b2
# downloads files from that snapshot and stages them locally
dorky --push  # publish the restored state as a new commit`}</CodeBlock>
      <Callout type="info" title="Restore is non-destructive on remote">
        Checkout stages the historical files locally; you still need to push to make the restored
        state the new canonical version.
      </Callout>
    </section>
  );
}

function DorkyIgnore() {
  return (
    <section>
      <Heading as="h2" id="dorkyignore" className="text-3xl font-semibold mt-14 mb-4">.dorkyignore</Heading>
      <p>
        Like <code>.gitignore</code>, but for dorky's file scanner. Use it to keep generated
        artifacts, dependencies, and large directories out of the candidate list.
      </p>
      <CodeBlock lang="text">{`node_modules/
.git/
dist/
build/
*.log
coverage/`}</CodeBlock>
    </section>
  );
}

function CliReference() {
  const rows = [
    ['--init <provider>', '-i', 'Initialize a project. Provider is aws or google-drive.'],
    ['--list [remote]', '-l', 'List local stageable files, or files in remote storage.'],
    ['--add <files...>', '-a', 'Stage one or more files for upload.'],
    ['--rm <files...>', '-r', 'Unstage files. After the next push they are deleted from remote.'],
    ['--push', '-ph', 'Upload staged files and record a commit snapshot.'],
    ['--pull', '-pl', 'Download all tracked files from remote storage.'],
    ['--log', '-lg', 'Show push history in reverse chronological order.'],
    ['--checkout <id>', '-co', 'Restore files from a history commit. Prefix matching supported.'],
    ['--migrate <target>', '-m', 'Migrate the project to another storage backend.'],
    ['--destroy', '-d', 'Delete the project from remote storage and remove local state.'],
  ];
  return (
    <section>
      <Heading as="h2" id="cli-overview" className="text-3xl font-semibold mt-14 mb-4">CLI reference</Heading>
      <p>
        Run <code>dorky --help</code> for the live, version-pinned reference. Every flag has a short
        alias, so any command can be expressed in two or three keystrokes.
      </p>
      <div className="overflow-x-auto my-4 rounded-lg elevate-hover">
        <table className="w-full text-base border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-left">
            <tr>
              <th className="py-2 px-3 font-semibold">Command</th>
              <th className="py-2 px-3 font-semibold">Alias</th>
              <th className="py-2 px-3 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([cmd, alias, desc]) => (
              <tr key={cmd} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2 px-3"><code>{cmd}</code></td>
                <td className="py-2 px-3"><code>{alias}</code></td>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Heading as="h3" id="cli-init" className="text-xl font-semibold mt-10 mb-3">init</Heading>
      <CodeBlock lang="bash">{`dorky --init aws
dorky --init google-drive`}</CodeBlock>
      <p>Bootstraps <code>.dorky/</code>, writes <code>.dorkyignore</code>, and updates <code>.gitignore</code> to protect credentials.</p>

      <Heading as="h3" id="cli-list" className="text-xl font-semibold mt-10 mb-3">list</Heading>
      <CodeBlock lang="bash">{`dorky --list           # local files that can be staged
dorky --list remote    # files in storage`}</CodeBlock>

      <Heading as="h3" id="cli-add-rm" className="text-xl font-semibold mt-10 mb-3">add / rm</Heading>
      <CodeBlock lang="bash">{`dorky --add .env config.yml secrets.json
dorky --rm old-config.yml`}</CodeBlock>
      <p>
        Unstaged files are deleted from remote storage on the next <code>--push</code>, so
        <code>--rm</code> + <code>--push</code> is how you remove a tracked file entirely.
      </p>

      <Heading as="h3" id="cli-push-pull" className="text-xl font-semibold mt-10 mb-3">push / pull</Heading>
      <CodeBlock lang="bash">{`dorky --push   # uploads new + changed files, removes unstaged ones
dorky --pull   # downloads all tracked files, creating directories as needed`}</CodeBlock>
      <Callout type="info" title="Hash-aware">
        Push compares MD5 hashes against the latest commit; unchanged files are skipped, and a fully
        unchanged push becomes a no-op.
      </Callout>

      <Heading as="h3" id="cli-log-checkout" className="text-xl font-semibold mt-10 mb-3">log / checkout</Heading>
      <CodeBlock lang="bash">{`dorky --log
dorky --checkout <commit-id-or-prefix>`}</CodeBlock>

      <Heading as="h3" id="cli-destroy" className="text-xl font-semibold mt-10 mb-3">destroy</Heading>
      <CodeBlock lang="bash">dorky --destroy</CodeBlock>
      <Callout type="warn" title="Irreversible">
        Deletes all tracked files (and history snapshots) from remote storage, then removes
        <code>.dorky/</code> and <code>.dorkyignore</code> locally.
      </Callout>
    </section>
  );
}

function VSCodeExtension() {
  return (
    <section>
      <Heading as="h2" id="vscode-overview" className="text-3xl font-semibold mt-14 mb-4">VS Code extension</Heading>
      <p>
        The <code>dorky-extension</code> adds a Dorky sidebar to the activity bar — a Source
        Control-style view of your staged and uploaded files, with toolbar and per-item actions.
      </p>

      <Heading as="h3" id="vscode-install" className="text-xl font-semibold mt-8 mb-3">Install</Heading>
      <p>From the VS Code Marketplace:</p>
      <CodeBlock lang="bash">code --install-extension trishantpahwa.dorky-extension</CodeBlock>
      <p>
        Or open the{' '}
        <a className="text-blue-600 dark:text-blue-400 hover:underline"
           href="https://marketplace.visualstudio.com/items?itemName=trishantpahwa.dorky-extension"
           target="_blank" rel="noopener noreferrer">
          Marketplace listing
        </a>{' '}
        directly.
      </p>

      <Heading as="h3" id="vscode-commands" className="text-xl font-semibold mt-8 mb-3">Commands</Heading>
      <div className="overflow-x-auto my-3 rounded-lg elevate-hover">
        <table className="w-full text-base border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-left">
            <tr>
              <th className="py-2 px-3 font-semibold">Command</th>
              <th className="py-2 px-3 font-semibold">Where</th>
              <th className="py-2 px-3 font-semibold">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Dorky: Initialize Project', 'Welcome view', 'Bootstrap a project from an empty workspace.'],
              ['Dorky: Add Files', 'View toolbar', 'Pick files to stage for upload.'],
              ['Unstage', 'Item context menu', 'Remove a staged file from tracking.'],
              ['Dorky: Push', 'View toolbar', 'Upload staged changes.'],
              ['Dorky: Pull', 'View toolbar', 'Download tracked files from remote.'],
              ['Dorky: List Remote Files', 'View toolbar', 'Inspect what is currently in storage.'],
              ['Dorky: Show History', 'View toolbar', 'Browse past push commits.'],
              ['Dorky: Checkout Commit', 'Inline on commit', 'Restore files from a chosen commit.'],
              ['Dorky: Destroy Project', 'View toolbar', 'Tear down local + remote state.'],
              ['Dorky: Refresh', 'View toolbar', 'Re-read state from disk and remote.'],
            ].map(([cmd, where, purpose]) => (
              <tr key={cmd} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2 px-3 font-medium">{cmd}</td>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{where}</td>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Callout type="info" title="Shared state with the CLI">
        The extension reads and writes the same <code>.dorky/</code> directory the CLI uses, so you
        can freely switch between editor and terminal mid-workflow.
      </Callout>
    </section>
  );
}

function McpServer() {
  return (
    <section>
      <Heading as="h2" id="mcp-overview" className="text-3xl font-semibold mt-14 mb-4">MCP server</Heading>
      <p>
        <code>dorky-mcp</code> is a{' '}
        <a className="text-blue-600 dark:text-blue-400 hover:underline"
           href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer">
          Model Context Protocol
        </a>{' '}
        stdio server. Once configured, an AI coding assistant — Claude Desktop, Cursor, VS Code
        Copilot — can run dorky commands during a chat session.
      </p>

      <Heading as="h3" id="mcp-tools" className="text-xl font-semibold mt-8 mb-3">Tools</Heading>
      <div className="overflow-x-auto my-3 rounded-lg elevate-hover">
        <table className="w-full text-base border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <thead className="bg-slate-50 dark:bg-slate-900/40 text-left">
            <tr>
              <th className="py-2 px-3 font-semibold">Tool</th>
              <th className="py-2 px-3 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['init', 'Initialize a project (aws or google-drive).'],
              ['list', 'List local stageable files, or files in remote storage.'],
              ['add', 'Stage files for upload.'],
              ['remove', 'Unstage files.'],
              ['push', 'Push staged files to remote storage.'],
              ['pull', 'Pull tracked files from remote storage.'],
              ['log', 'Show push history.'],
              ['checkout', 'Restore files from a history commit.'],
              ['destroy', 'Destroy the project locally and remotely.'],
            ].map(([t, d]) => (
              <tr key={t} className="border-t border-slate-200 dark:border-slate-800">
                <td className="py-2 px-3"><code>{t}</code></td>
                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Heading as="h3" id="mcp-configure" className="text-xl font-semibold mt-8 mb-3">Configure your client</Heading>
      <Tabs
        tabs={[
          {
            label: 'Claude Desktop',
            content: (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>{' '}
                  (macOS) or <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows).
                </p>
                <CodeBlock lang="json">{`{
  "mcpServers": {
    "dorky": {
      "command": "npx",
      "args": ["dorky-mcp"],
      "env": {
        "AWS_ACCESS_KEY": "your-access-key",
        "AWS_SECRET_KEY": "your-secret-key",
        "AWS_REGION": "us-east-1",
        "BUCKET_NAME": "your-bucket-name"
      }
    }
  }
}`}</CodeBlock>
              </>
            ),
          },
          {
            label: 'VS Code Copilot',
            content: (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  In your VS Code <code>settings.json</code>:
                </p>
                <CodeBlock lang="json">{`{
  "mcp": {
    "servers": {
      "dorky": {
        "type": "stdio",
        "command": "npx",
        "args": ["dorky-mcp"],
        "env": {
          "AWS_ACCESS_KEY": "your-access-key",
          "AWS_SECRET_KEY": "your-secret-key",
          "AWS_REGION": "us-east-1",
          "BUCKET_NAME": "your-bucket-name"
        }
      }
    }
  }
}`}</CodeBlock>
              </>
            ),
          },
          {
            label: 'Cursor',
            content: (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <code>.cursor/mcp.json</code> (per-project) or{' '}
                  <code>~/.cursor/mcp.json</code> (global):
                </p>
                <CodeBlock lang="json">{`{
  "mcpServers": {
    "dorky": {
      "command": "npx",
      "args": ["dorky-mcp"],
      "env": {
        "AWS_ACCESS_KEY": "your-access-key",
        "AWS_SECRET_KEY": "your-secret-key",
        "AWS_REGION": "us-east-1",
        "BUCKET_NAME": "your-bucket-name"
      }
    }
  }
}`}</CodeBlock>
              </>
            ),
          },
        ]}
      />
      <Callout type="warn" title="Credentials are visible to your AI client">
        MCP server env blocks are stored in plain text in the client's config file. Use IAM users
        with minimum-required permissions and rotate keys regularly.
      </Callout>
    </section>
  );
}

function EnvVars() {
  return (
    <section>
      <Heading as="h2" id="env-vars" className="text-3xl font-semibold mt-14 mb-4">Environment variables</Heading>
      <p>For AWS S3-backed projects:</p>
      <CodeBlock lang="bash">{`export AWS_ACCESS_KEY="your-access-key"
export AWS_SECRET_KEY="your-secret-key"
export AWS_REGION="us-east-1"
export BUCKET_NAME="your-bucket-name"`}</CodeBlock>
      <p>
        For Google Drive there are no env vars — credentials live in
        {' '}<code>google-drive-credentials.json</code> at the project root, and per-user OAuth
        tokens are written to <code>.dorky/credentials.json</code> after the first <code>--init</code>.
      </p>
    </section>
  );
}

function Security() {
  return (
    <section>
      <Heading as="h2" id="security" className="text-3xl font-semibold mt-14 mb-4">Security best practices</Heading>
      <ul className="list-disc ml-6 space-y-2">
        <li>Never commit <code>.dorky/credentials.json</code> to version control — dorky adds it to <code>.gitignore</code> on init, but double-check.</li>
        <li>Prefer environment variables for AWS credentials over hard-coding them in MCP client configs.</li>
        <li>Use an IAM user with the minimum policy shown in <a className="text-blue-600 dark:text-blue-400 hover:underline" href="#prereq-aws">Prerequisites</a>.</li>
        <li>Rotate access keys on a schedule.</li>
        <li>Review <code>.dorkyignore</code> before your first push to avoid uploading something you didn't mean to.</li>
        <li>Keep <code>google-drive-credentials.json</code> out of git.</li>
      </ul>
    </section>
  );
}

function Troubleshooting() {
  return (
    <section>
      <Heading as="h2" id="troubleshooting" className="text-3xl font-semibold mt-14 mb-4">Troubleshooting</Heading>

      <Heading as="h3" id="ts-aws" className="text-xl font-semibold mt-8 mb-3">AWS: missing credentials</Heading>
      <p>Set the required environment variables and re-run the command:</p>
      <CodeBlock lang="bash">{`export AWS_ACCESS_KEY="your-key"
export AWS_SECRET_KEY="your-secret"
export AWS_REGION="us-east-1"
export BUCKET_NAME="your-bucket"`}</CodeBlock>

      <Heading as="h3" id="ts-gdrive-invalid" className="text-xl font-semibold mt-8 mb-3">Google Drive: invalid credentials</Heading>
      <CodeBlock lang="bash">dorky --init google-drive</CodeBlock>
      <p>This triggers the OAuth flow again and refreshes <code>.dorky/credentials.json</code>.</p>

      <Heading as="h3" id="ts-gdrive-expired" className="text-xl font-semibold mt-8 mb-3">Google Drive: token expired</Heading>
      <p>
        Dorky refreshes tokens automatically. If it still fails, delete
        {' '}<code>.dorky/credentials.json</code> and re-authenticate.
      </p>
    </section>
  );
}

function Resources() {
  return (
    <section>
      <Heading as="h2" id="resources" className="text-3xl font-semibold mt-14 mb-4">Resources</Heading>
      <ul className="space-y-2">
        <li>📦 <a className="text-blue-600 dark:text-blue-400 hover:underline" href="https://www.npmjs.com/package/dorky" target="_blank" rel="noopener noreferrer">npm package — dorky</a></li>
        <li>🧩 <a className="text-blue-600 dark:text-blue-400 hover:underline" href="https://marketplace.visualstudio.com/items?itemName=trishantpahwa.dorky-extension" target="_blank" rel="noopener noreferrer">VS Code Marketplace — dorky-extension</a></li>
        <li>🐙 <a className="text-blue-600 dark:text-blue-400 hover:underline" href="https://github.com/trishantpahwa/dorky" target="_blank" rel="noopener noreferrer">GitHub — source code</a></li>
        <li>🐛 <a className="text-blue-600 dark:text-blue-400 hover:underline" href="https://github.com/trishantpahwa/dorky/issues" target="_blank" rel="noopener noreferrer">GitHub issues — report a bug</a></li>
        <li>📚 <a className="text-blue-600 dark:text-blue-400 hover:underline" href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer">Model Context Protocol</a></li>
      </ul>
    </section>
  );
}

/* -------------------- App -------------------- */

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const activeId = useActiveSection(allSectionIds);

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} theme={theme} onToggleTheme={toggleTheme} />

      <div className="max-w-7xl mx-auto flex">
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} activeId={activeId} />

        <main className="flex-1 min-w-0 px-4 sm:px-8 py-10 lg:pl-12">
          <article className="max-w-4xl mx-auto">
            <Hero />
            <Reveal><CommunitySection /></Reveal>
            <Reveal><Installation /></Reveal>
            <Reveal><QuickStart /></Reveal>
            <Reveal><Prerequisites /></Reveal>
            <Reveal><HowItWorks /></Reveal>
            <Reveal><ProjectLayout /></Reveal>
            <Reveal><HistoryAndCheckout /></Reveal>
            <Reveal><DorkyIgnore /></Reveal>
            <Reveal><CliReference /></Reveal>
            <Reveal><VSCodeExtension /></Reveal>
            <Reveal><McpServer /></Reveal>
            <Reveal><EnvVars /></Reveal>
            <Reveal><Security /></Reveal>
            <Reveal><Troubleshooting /></Reveal>
            <Reveal><Resources /></Reveal>

            <footer className="mt-20 pt-6 border-t border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400 flex items-center justify-between flex-wrap gap-2">
              <p>© 2024–2026 Dorky · ISC License</p>
              <div className="flex gap-4">
                <a className="hover:text-blue-600 dark:hover:text-blue-400" href="/privacy-policy">Privacy</a>
                <a className="hover:text-blue-600 dark:hover:text-blue-400" href="/terms-and-conditions">Terms</a>
              </div>
            </footer>
          </article>
        </main>
      </div>
    </div>
  );
}

export default App;
