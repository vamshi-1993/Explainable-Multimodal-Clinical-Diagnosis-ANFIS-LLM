import { useEffect, useRef, useState } from "react";
import { getOrgans, analyseScan, sendChat } from "./api";
import "./App.css";

const SUBTITLE = { brain: "MRI", skin: "Dermoscopy", retina: "OCT" };
const LEVEL_COLOUR = { Low: "var(--blue)", Medium: "var(--amber)", High: "var(--rose)" };
const BAR_COLOURS = ["var(--accent)", "var(--amber)", "var(--violet)", "var(--blue)",
                     "var(--text-dim)", "var(--text-dim)", "var(--text-dim)"];

const DISCLAIMER =
  "Decision support only. This is not a medical diagnosis. Always consult a qualified clinician.";

export default function App() {
  const [organs, setOrgans] = useState([]);
  const [organ, setOrgan] = useState("brain");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getOrgans().then(setOrgans).catch(() =>
      setError("Could not reach the backend. Is uvicorn running on port 8000?"));
  }, []);

  function pickFile(f) {
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f)); setResult(null); setError(null);
  }

  async function analyse() {
    if (!file) return;
    setLoading(true); setError(null);
    try { setResult(await analyseScan(file, organ)); }
    catch (e) { setError(e.response?.data?.detail || "Analysis failed."); }
    finally { setLoading(false); }
  }

  function reset() { setResult(null); setFile(null); setPreview(null); setError(null); }

  const current = organs.find((o) => o.organ === organ);

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none"
               strokeWidth="2" strokeLinecap="round">
            <circle cx="16" cy="16" r="13" />
            <path d="M8 18c3-6 5 4 8-2s5 4 8-2" />
          </svg>
          <div>
            <div className="brand-title">Clinical Diagnosis Support</div>
            <div className="brand-sub">{result ? `${organ} model` : "CNN · Bottleneck · ANFIS"}</div>
          </div>
        </div>
        {result && <div className="header-right">
          <button className="ghost-btn" onClick={reset}>New scan</button>
        </div>}
      </header>

      {error && <div className="error-banner">{error}</div>}

      {!result
        ? <Upload organs={organs} organ={organ} setOrgan={setOrgan} current={current}
                  preview={preview} pickFile={pickFile} analyse={analyse}
                  loading={loading} hasFile={!!file} />
        : <Results result={result} preview={preview} organ={organ} />}

      <div className="bottom-disclaimer">{DISCLAIMER}</div>
    </div>
  );
}

function Upload({ organs, organ, setOrgan, current, preview, pickFile, analyse, loading, hasFile }) {
  const inputRef = useRef();
  const [drag, setDrag] = useState(false);

  return (
    <main className="upload-wrap">
      <h1>Upload a <span className="hl">scan</span></h1>
      <p className="lead">
        Pick the body part, then add the image. The matching model reads the scan,
        and the fuzzy engine shows which rules led to the result.
      </p>

      <div className="section-label">1 · Body part</div>
      <div className="organ-grid">
        {organs.map((o) => (
          <button key={o.organ}
                  className={`organ-card ${organ === o.organ ? "selected" : ""}`}
                  onClick={() => setOrgan(o.organ)}>
            <span className="organ-name">{o.organ}</span>
            <span className="organ-sub">{SUBTITLE[o.organ] || ""}</span>
          </button>
        ))}
      </div>
      {current && <p className="organ-note">Detects: {current.classes.join(" · ")}</p>}

      <div className="section-label">2 · Image</div>
      <div className={`dropzone ${drag ? "dragging" : ""}`}
           onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
           onDragLeave={() => setDrag(false)}
           onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}>
        <input ref={inputRef} type="file" accept="image/*" hidden
               onChange={(e) => pickFile(e.target.files[0])} />
        {preview ? <img src={preview} alt="preview" className="preview-img" /> : (
          <>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
                 strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" /><path d="M7 9l5-5 5 5" />
              <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <div className="drop-title">Drop an image here</div>
            <div className="drop-sub">JPEG or PNG</div>
          </>
        )}
        <div className="drop-actions">
          <button className="ghost-btn" onClick={() => inputRef.current.click()}>Browse files</button>
          <button className="primary-btn" disabled={!hasFile || loading} onClick={analyse}>
            {loading ? "Analysing…" : "Analyse scan"}
          </button>
        </div>
      </div>

      <p className="footnote">Scans are processed for this session only and are not stored.</p>
    </main>
  );
}

function Results({ result, preview, organ }) {
  const entries = Object.entries(result.all_classes).sort((a, b) => b[1] - a[1]);
  const [topName, topP] = entries[0];
  const others = entries.slice(1).filter(([, p]) => p >= 0.08);

  return (
    <main className="results-wrap">
      <div className="left-col">
        <section className="card headline">
          <div>
            <div className="section-label">Most likely finding</div>
            <h2 className="finding">{topName.replace(/_/g, " ")}</h2>
            <div className="score-row">
              <span className="score">{(topP * 100).toFixed(0)}%</span>
              <span className="muted">model confidence</span>
            </div>
          </div>
          <div className="classes">
            <div className="section-label">Possible conditions</div>
            {entries.map(([name, p], i) => (
              <div className="class-row" key={name}>
                <span className="class-name">{name.replace(/_/g, " ")}</span>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${p * 100}%`,
                       background: BAR_COLOURS[i] || "var(--text-dim)" }} />
                </div>
                <span className="class-pct" style={{ color: BAR_COLOURS[i] || "var(--text-dim)" }}>
                  {(p * 100).toFixed(0)}%
                </span>
              </div>
            ))}
            {others.length > 0 && (
              <p className="alt-note">
                Also worth considering:{" "}
                {others.map(([n, p], i) => (
                  <span key={n}>
                    {i > 0 && ", "}
                    <strong>{n.replace(/_/g, " ")}</strong> ({(p * 100).toFixed(0)}%)
                  </span>
                ))}.
              </p>
            )}
          </div>
        </section>

        <section className="card">
          <h3>Scan</h3>
          <div className="image-row">
            <figure>
              <img src={preview} alt="uploaded scan" className="scan-img" />
              <figcaption>Uploaded scan</figcaption>
            </figure>
            {result.overlay ? (
              <figure>
                <img src={result.overlay} alt="predicted region" className="scan-img" />
                <figcaption>
                  Region of interest · {(result.outline_area * 100).toFixed(1)}% of image
                </figcaption>
              </figure>
            ) : (
              <div className="no-outline">
                This model has no segmentation head, so no region outline is available.
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <h3>Bottleneck parameters</h3>
          <p className="muted small">
            The CNN&apos;s features are compressed into four measurable values, then
            graded Low, Medium or High for the fuzzy rules.
          </p>
          <div className="param-grid">
            {result.parameters.map((p) => (
              <div className="param-card" key={p.name}>
                <div className="param-top">
                  <span className="param-name">{p.name.replace(/_/g, " ")}</span>
                  <span className="param-val" style={{ color: LEVEL_COLOUR[p.level] }}>
                    {(p.value * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${p.value * 100}%`,
                       background: LEVEL_COLOUR[p.level] }} />
                </div>
                <span className="param-level" style={{ color: LEVEL_COLOUR[p.level] }}>
                  {p.level}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Fuzzy rules that fired</h3>
          <p className="muted small">
            Each rule shows how strongly its conditions matched this scan.
            The prediction is the weighted vote of all 81 rules.
          </p>
          {result.rules.map((r) => (
            <div className="rule-row" key={r.id}>
              <span className="rule-id">{r.id}</span>
              <span className="rule-text"><RuleText text={r.text} /></span>
              <span className="rule-match">
                <span className="rule-pct">{(r.strength * 100).toFixed(0)}%</span>
                <span className="rule-label">MATCH</span>
              </span>
            </div>
          ))}
        </section>
      </div>

      <Chat sessionId={result.session_id} organ={organ} />
    </main>
  );
}

function RuleText({ text }) {
  const [cond, concl] = text.split(" THEN ");
  const parts = cond.split(/\b(IF|AND|is)\b/);
  return (
    <>
      {parts.map((p, i) =>
        ["IF", "AND", "is"].includes(p)
          ? <span className="kw" key={i}>{p}</span>
          : <span key={i}>{p}</span>)}
      <span className="kw"> THEN </span>
      <span className="cls">{concl}</span>
    </>
  );
}

function Chat({ sessionId, organ }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef();

  useEffect(() => {
    setBusy(true);
    sendChat(sessionId, "Explain this result in plain language, what it means, and the next steps.")
      .then((reply) => setMessages([{ role: "bot", text: reply }]))
      .catch((e) => setMessages([{ role: "bot",
        text: "The assistant is unavailable: " + (e.response?.data?.detail || e.message) }]))
      .finally(() => setBusy(false));
  }, [sessionId]);

  useEffect(() => { boxRef.current?.scrollTo(0, boxRef.current.scrollHeight); }, [messages, busy]);

  async function send(e, preset) {
    e?.preventDefault();
    const q = (preset ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
            const reply = await sendChat(sessionId, q);
      setMessages((m) => [...m, { role: "bot", text: reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "bot",
        text: "Sorry, that failed: " + (e.response?.data?.detail || e.message) }]);
    } finally { setBusy(false); }
  }

  const suggestions = ["Why this and not the others?", "How reliable is this model?",
                       "What do the parameters mean?", "What can I do myself?"];

  return (
    <aside className="chat-panel">
      <div className="chat-head">
        <h3>Assistant</h3>
        <code className="tools-line">
          analyse_scan · get_condition_info · list_rules · model_performance
        </code>
      </div>

      <div className="chat-body" ref={boxRef}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "msg-user" : "msg-bot"}>
            <Markdownish text={m.text} />
          </div>
        ))}
        {busy && <div className="msg-bot typing">thinking…</div>}
      </div>

      {!busy && messages.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={(e) => send(e, s)}>{s}</button>
          ))}
        </div>
      )}

      <form className="chat-input" onSubmit={send}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
               placeholder="Ask about this result" disabled={busy} />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">→</button>
      </form>
    </aside>
  );
}

function Markdownish({ text }) {
  return (
    <>
      {text.split("\n").filter((l) => l.trim()).map((line, i) => {
        const bullet = /^[-*]\s+/.test(line);
        const clean = line.replace(/^[-*]\s+/, "").replace(/^#+\s*/, "");
        const content = clean.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith("**") && p.endsWith("**")
            ? <strong key={j}>{p.slice(2, -2)}</strong>
            : <span key={j}>{p}</span>);
        return bullet ? <div className="bullet" key={i}>▸ {content}</div>
                      : <p key={i}>{content}</p>;
      })}
    </>
  );
}