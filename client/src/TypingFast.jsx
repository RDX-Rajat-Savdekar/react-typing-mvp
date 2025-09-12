import React, { useEffect, useRef, useState } from "react";

/**
 * TypingFast (improved)
 * - single absolute caret moved via transform (smooth)
 * - full reset on problem change (no leftover green)
 */
export default function TypingFast({ problem, onFinish, autoSubmit = true }) {
  const text = problem?.text ?? "";
  const chars = [...text];
  const containerRef = useRef(null);
  const promptRef = useRef(null);
  const inputRef = useRef(null);
  const caretRef = useRef(null);
  const spansRef = useRef([]);
  const [pos, setPos] = useState(0);
  const startTsRef = useRef(null);
  const finishedRef = useRef(false);

  // --- RESET on problem change ---
  useEffect(() => {
    // clear any previous spans' classes & dataset
    if (spansRef.current && spansRef.current.length) {
      spansRef.current.forEach((s) => {
        if (s) {
          s.classList.remove("correct", "incorrect");
          delete s.dataset.typedChar;
        }
      });
    }
    spansRef.current = [];
    finishedRef.current = false;
    startTsRef.current = null;
    setPos(0);
    // focus input shortly after mount
    setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
    // position caret at start
    requestAnimationFrame(() => moveCaretToIndex(0, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem?.id]);

  // --- caret movement function (smooth) ---
  // modeForceInstant: if true, place caret without transition (used on reset)
  function moveCaretToIndex(index, modeForceInstant = false) {
    const caret = caretRef.current;
    const container = containerRef.current;
    if (!caret || !container) return;

    // find target element (span) or end position
    let targetEl = spansRef.current[index];
    let x = 0, y = 0, h = 18;
    if (targetEl) {
      const tRect = targetEl.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      x = tRect.left - cRect.left;
      y = tRect.top - cRect.top;
      h = tRect.height;
    } else {
      // caret at end: position after last span
      const last = spansRef.current[spansRef.current.length - 1];
      if (last) {
        const lRect = last.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        // place caret after last char: x = last.right - container.left
        x = lRect.right - cRect.left;
        y = lRect.top - cRect.top;
        h = lRect.height;
      } else {
        // empty prompt fallback
        x = 4; y = 4; h = 18;
      }
    }

    // set caret height to match line height for visual alignment
    caret.style.height = `${Math.max(14, Math.round(h))}px`;

    // Use transform for GPU-accelerated smooth movement
    // If forced instant, temporarily disable transition
    if (modeForceInstant) {
      caret.style.transition = "none";
      caret.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      // force reflow then restore transition
      void caret.offsetWidth;
      caret.style.transition = "";
    } else {
      // Use requestAnimationFrame to avoid layout thrash
      window.requestAnimationFrame(() => {
        caret.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
    }
  }

  // call moveCaret when pos changes
  useEffect(() => {
    moveCaretToIndex(pos, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  // metrics helpers (unchanged)
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

  // finish logic (unchanged)
  function finishIfNeeded(now) {
    if (finishedRef.current) return;
    if (pos >= chars.length) {
      finishedRef.current = true;
      const endTs = now || Date.now();
      const durationMs = startTsRef.current ? endTs - startTsRef.current : 0;
      const typedStr = spansRef.current.map((s) => s && s.dataset.typedChar ? s.dataset.typedChar : "").join("");
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

  // typing handlers (unchanged semantics)
  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); return; }
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
      // 4 spaces
      [" ", " ", " ", " "].forEach((s) => writeChar(s));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      writeChar(e.key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fullReset();
    } else {
      // ignore other keys
    }
  }

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

  // full reset that clears classes & datasets
  function fullReset() {
    finishedRef.current = false;
    startTsRef.current = null;
    setPos(0);
    spansRef.current.forEach((s) => {
      if (s) {
        s.classList.remove("correct", "incorrect");
        delete s.dataset.typedChar;
      }
    });
    // place caret instantly at start
    moveCaretToIndex(0, true);
    inputRef.current && (inputRef.current.value = "");
    inputRef.current && inputRef.current.focus();
  }

  // Ensure caret is positioned on mount
  useEffect(() => {
    requestAnimationFrame(() => moveCaretToIndex(pos, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // render spans once per problem
  return (
    <div className="typing-root" onClick={() => inputRef.current && inputRef.current.focus()}>
      <h2>{problem.title}</h2>
      <div ref={containerRef} className="prompt-wrapper" style={{ position: "relative", maxHeight: 360, overflow: "auto" }}>
        <div ref={promptRef} className="prompt" style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 15, padding: 12, borderRadius: 8, background: "#222", color: "#ddd", border: "1px solid #333" }}>
          {chars.map((c, i) => (
            <span
              key={i}
              ref={(el) => { spansRef.current[i] = el; }}
              className="prompt-char"
              data-idx={i}
            >
              {c}
            </span>
          ))}
        </div>

        {/* absolute caret element */}
        <div
          ref={caretRef}
          className="typing-caret"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 2,
            height: 18,
            background: "#9be0ff",
            transform: "translate3d(0,0,0)",
            transition: "transform 0.08s linear",
            pointerEvents: "none",
          }}
        />
      </div>

      <input
        ref={inputRef}
        onKeyDown={handleKeyDown}
        onPaste={(e) => e.preventDefault()}
        style={{ position: "absolute", opacity: 0, left: -9999 }}
        autoComplete="off"
        spellCheck="false"
      />

      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="metrics">
          <div>Elapsed: {startTsRef.current ? Math.round((Date.now() - startTsRef.current) / 1000) : 0}s</div>
          <div>
            WPM: {startTsRef.current ? calcWPM(spansRef.current.reduce((a, s) => a + (s && s.dataset.typedChar ? 1 : 0), 0), Date.now() - startTsRef.current) : 0}
          </div>
          <div>Accuracy: {spansRef.current.length ? calcAccuracy(spansRef.current.reduce((a, s) => a + (s && s.dataset.typedChar ? 1 : 0), 0)) : 100}%</div>
        </div>

        <div>
          <button onClick={fullReset}>Reset</button>
        </div>
      </div>

      <style>{`
        .prompt-char { display:inline-block; min-width:6px; }
        .prompt-char.correct { color: #9be19b; background: rgba(155,225,155,0.04); }
        .prompt-char.incorrect { color: #ffb4b4; background: rgba(255,80,80,0.02); text-decoration: underline wavy rgba(255,80,80,0.2); }
        .typing-caret { z-index: 50; border-radius: 1px; }
        button { background:#2b3133; color:#fff; border:1px solid #3b4143; padding:6px 10px; border-radius:6px; cursor:pointer; }
      `}</style>
    </div>
  );
}
