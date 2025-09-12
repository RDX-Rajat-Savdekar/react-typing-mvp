// client/src/TypingFastCached.jsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * TypingFastCached.jsx
 * - Render prompt as per-char spans
 * - Cache span bounding rects once on mount / resize
 * - Single absolute caret moved via transform with CSS transition (GPU)
 * - Full reset on problem change (clears classes/dataset)
 *
 * Props:
 *  - problem: { id, title, text }
 *  - onFinish(attempt) optional callback
 *  - autoSubmit (boolean) defaults true
 */
export default function TypingFastCached({ problem, onFinish, autoSubmit = true }) {
  const text = problem?.code ?? problem?.text ?? "";
  const chars = [...text]; // preserves spaces/newlines
  const containerRef = useRef(null);
  const promptRef = useRef(null);
  const spansRef = useRef([]);
  const cachedRects = useRef([]); // cached {left, top, width, height} relative to container
  const caretRef = useRef(null);
  const inputRef = useRef(null);

  const [pos, setPos] = useState(0);
  const startTsRef = useRef(null);
  const finishedRef = useRef(false);
  const [report, setReport] = useState(null);

  // --- compute and cache spans' rects relative to container ---
  function computeSpanRects() {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    cachedRects.current = spansRef.current.map((el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left - cRect.left,
        top: r.top - cRect.top,
        width: r.width,
        height: r.height,
      };
    });
  }

  // --- move caret using cached rects (fast) ---
  function moveCaretToIndexCached(index, instant = false) {
    const caret = caretRef.current;
    const rects = cachedRects.current;
    const container = containerRef.current;
    if (!caret || !container) return;

    let x = 0,
      y = 0,
      h = 18;
    const target = rects[index];
    if (target) {
      x = Math.round(target.left);
      y = Math.round(target.top);
      h = Math.round(target.height);
    } else {
      // caret at end -> after last char
      const last = rects[rects.length - 1];
      if (last) {
        x = Math.round(last.left + last.width);
        y = Math.round(last.top);
        h = Math.round(last.height);
      } else {
        // empty prompt fallback
        x = 4;
        y = 4;
        h = 18;
      }
    }

    caret.style.height = `${Math.max(12, h)}px`;
    const transform = `translate3d(${x}px, ${y}px, 0)`;

    if (instant) {
      caret.style.transition = "none";
      caret.style.transform = transform;
      // force reflow then restore transition
      // eslint-disable-next-line no-unused-expressions
      caret.offsetWidth;
      caret.style.transition = "";
    } else {
      // schedule on rAF for smoothness
      window.requestAnimationFrame(() => {
        caret.style.transform = transform;
      });
    }

    // ensure caret visibility (scroll if necessary)
    // scroll container so caret's Y is visible
    try {
      const containerRect = container.getBoundingClientRect();
      const caretTop = y;
      const caretBottom = y + h;
      if (caretTop < container.scrollTop) {
        container.scrollTop = caretTop - 8;
      } else if (caretBottom > container.scrollTop + container.clientHeight) {
        container.scrollTop = caretBottom - container.clientHeight + 8;
      }
    } catch (e) {
      // ignore
    }
  }

  // --- full reset (clear classes/dataset and recompute rects) ---
  function fullReset() {
    finishedRef.current = false;
    startTsRef.current = null;
    setPos(0);
    setReport(null);
    // clear classes & dataset
    spansRef.current.forEach((s) => {
      if (!s) return;
      s.classList.remove("correct", "incorrect");
      delete s.dataset.typedChar;
    });
    // recompute rects (in case layout changed), then position caret instantly
    computeSpanRects();
    moveCaretToIndexCached(0, true);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }

  // --- finish handling ---
  function calcWPM(charsCount, ms) {
    const words = charsCount / 5;
    const minutes = ms / 60000;
    return minutes > 0 ? Math.round(words / minutes) : 0;
  }
  function calcAccuracy(typedLen) {
    if (!typedLen) return 100;
    const correct = spansRef.current.reduce((acc, s) => acc + (s && s.classList.contains("correct") ? 1 : 0), 0);
    return Math.round((correct / typedLen) * 100);
  }

  function finishIfNeeded(now) {
    if (finishedRef.current) return;
    if (pos >= chars.length) {
      finishedRef.current = true;
      const endTs = now || Date.now();
      const durationMs = startTsRef.current ? endTs - startTsRef.current : 0;
      const typedStr = spansRef.current.map((s) => (s && s.dataset.typedChar ? s.dataset.typedChar : "")).join("");
      const wpm = calcWPM(typedStr.length, durationMs);
      const accuracy = calcAccuracy(typedStr.length);
      const attempt = {
        user: localStorage.getItem("nick") || "anon",
        problemId: problem.id,
        wpm,
        accuracy,
        rawText: typedStr,
        durationMs,
      };
      setReport({ wpm, accuracy, durationMs, rawText: typedStr });
      if (autoSubmit) {
        fetch("/api/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt),
        }).catch((e) => console.error("save attempt failed", e));
      }
      if (onFinish) onFinish(attempt);
    }
  }

  // --- typing logic via invisible input ---
  function writeChar(ch) {
    if (finishedRef.current) return;
    const idx = pos;
    const span = spansRef.current[idx];
    if (!span) {
      // beyond end
      setPos((p) => p + 1);
      finishIfNeeded();
      return;
    }
    span.dataset.typedChar = ch;
    const expected = chars[idx];
    if (ch === expected) {
      span.classList.add("correct");
      span.classList.remove("incorrect");
    } else {
      span.classList.add("incorrect");
      span.classList.remove("correct");
    }
    setPos(idx + 1);
    finishIfNeeded();
  }

  function handleKeyDown(e) {
    // block paste via shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      return;
    }
    if (!startTsRef.current) startTsRef.current = Date.now();

    if (e.key === "Backspace") {
      e.preventDefault();
      if (pos === 0) return;
      const prev = pos - 1;
      const sp = spansRef.current[prev];
      if (sp) {
        sp.classList.remove("correct", "incorrect");
        delete sp.dataset.typedChar;
      }
      setPos(prev);
    } else if (e.key === "Enter") {
      e.preventDefault();
      writeChar("\n");
    } else if (e.key === "Tab") {
      e.preventDefault();
      // 4 spaces for tab
      writeChar(" ");
      writeChar(" ");
      writeChar(" ");
      writeChar(" ");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      writeChar(e.key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fullReset();
    } else {
      // ignore arrows, home/end, etc.
    }
  }

  // --- recompute rects after render / when problem changes ---
  useLayoutEffect(() => {
    // reset spansRef array to match new prompt
    spansRef.current = [];
    // give browser a tick to lay out, then compute rects
    const id = requestAnimationFrame(() => {
      computeSpanRects();
      // position caret at start instantly
      moveCaretToIndexCached(0, true);
    });
    // focus input shortly after
    const focusId = setTimeout(() => inputRef.current && inputRef.current.focus(), 20);

    return () => {
      cancelAnimationFrame(id);
      clearTimeout(focusId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem?.id, text]);

  // --- reposition on window resize (recompute rects) ---
  useEffect(() => {
    function onResize() {
      computeSpanRects();
      moveCaretToIndexCached(pos, true);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // update caret transform when pos changes (uses cached rects)
  useEffect(() => {
    moveCaretToIndexCached(pos, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // initial mount: place caret
  useEffect(() => {
    computeSpanRects();
    moveCaretToIndexCached(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // metrics live values computed for UI
  const elapsedSec = startTsRef.current ? Math.round((Date.now() - startTsRef.current) / 1000) : 0;
  const typedCount = spansRef.current.reduce((acc, s) => acc + (s && s.dataset.typedChar ? 1 : 0), 0);
  const currentWpm = startTsRef.current ? calcWPM(typedCount, Date.now() - startTsRef.current) : 0;
  const currentAcc = typedCount ? calcAccuracy(typedCount) : 100;

  // small helpers duplicated to avoid linter/no-use-before
  function calcWPM(charsCount, ms) {
    const words = charsCount / 5;
    const minutes = ms / 60000;
    return minutes > 0 ? Math.round(words / minutes) : 0;
  }
  function calcAccuracy(typedLen) {
    if (!typedLen) return 100;
    const correct = spansRef.current.reduce((acc, s) => acc + (s && s.classList.contains("correct") ? 1 : 0), 0);
    return Math.round((correct / typedLen) * 100);
  }

  return (
    <div className="typing-root" onClick={() => inputRef.current && inputRef.current.focus()}>
      <h2 style={{ margin: "8px 0" }}>{problem.title}</h2>

      {report ? (
        <div style={{
          background: "#1e293b",
          color: "#e6eef3",
          borderRadius: 8,
          padding: 20,
          margin: "16px 0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        }}>
          <h3>Test Summary</h3>
          <div>WPM: <b>{report.wpm}</b></div>
          <div>Accuracy: <b>{report.accuracy}%</b></div>
          <div>Time: <b>{Math.round(report.durationMs / 1000)}s</b></div>
          <div style={{marginTop:8}}>
            <div style={{fontWeight:'bold'}}>Your Typed Text:</div>
            <pre style={{background:'#0f1720',color:'#e6eef3',padding:12,borderRadius:6,overflowX:'auto'}}>{report.rawText}</pre>
          </div>
          <button onClick={fullReset} style={{...btnStyle, marginTop:12}}>Try Again</button>
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="prompt-wrapper"
            style={{
              position: "relative",
              maxHeight: 380,
              overflow: "auto",
              padding: 8,
              borderRadius: 8,
            }}
          >
            <div
              ref={promptRef}
              className="prompt"
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "ui-monospace, Menlo, Monaco, 'Courier New', monospace",
                fontSize: 15,
                padding: 12,
                borderRadius: 8,
                background: "#0f1720",
                color: "#e6eef3",
                border: "1px solid #1f2933",
                lineHeight: 1.5,
              }}
            >
              {chars.map((c, i) => (
                c === "\n" ? (
                  <span key={i} style={{display:'block',height:'0'}}></span>
                ) : (
                  <span
                    key={i}
                    ref={(el) => {
                      spansRef.current[i] = el;
                    }}
                    className="prompt-char"
                    data-idx={i}
                  >
                    {c}
                  </span>
                )
              ))}
            </div>

            {/* absolute caret element (moved with translate3d) */}
            <div
              ref={caretRef}
              className="typing-caret"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 2,
                height: 18,
                background: "#7dd3fc",
                transform: "translate3d(0,0,0)",
                transition: "transform 0.08s linear",
                willChange: "transform",
                pointerEvents: "none",
                borderRadius: 1,
              }}
            />
          </div>

          {/* hidden input to capture keystrokes */}
          <input
            ref={inputRef}
            onKeyDown={handleKeyDown}
            onPaste={(e) => e.preventDefault()}
            style={{ position: "absolute", opacity: 0, left: -9999 }}
            autoComplete="off"
            spellCheck="false"
          />

          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: "#9aa6b2", display: "flex", gap: 12 }}>
              <div>Elapsed: {elapsedSec}s</div>
              <div>WPM: {currentWpm}</div>
              <div>Accuracy: {currentAcc}%</div>
            </div>

            <div>
              <button onClick={fullReset} style={btnStyle}>
                Reset
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        .prompt-char { display:inline-block; min-width:6px; }
        .prompt-char.correct { color: #86efac; background: rgba(16,185,129,0.06); }
        .prompt-char.incorrect { color: #ffb4b4; background: rgba(248,113,113,0.04); text-decoration: underline wavy rgba(248,113,113,0.12); }
        .typing-caret { z-index: 50; }
        button { background:#111827; color:#fff; border:1px solid #1f2933; padding:6px 10px; border-radius:6px; cursor:pointer; }
        button:hover { filter: brightness(1.06); }
      `}</style>
    </div>
  );
}

// tiny button style reused
const btnStyle = {
  background: "#111827",
  color: "#fff",
  border: "1px solid #1f2933",
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
};
