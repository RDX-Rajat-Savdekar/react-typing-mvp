import React, { useEffect, useRef, useState } from "react";

/**
 * TypingCanvas (character-span based)
 * Props:
 *  - problem: { id, title, text }
 *  - onSubmitAttempt(optional): function(attempt) -> called when test finishes
 *  - autoSubmit (boolean): if true, POST to backend automatically (default true)
 */
export default function TypingCanvas({ problem, onSubmitAttempt, autoSubmit = true }) {
  // Normalize text to use '\n' for newlines, keep tabs as '\t'
  const text = problem?.text ?? "";
  const chars = [...text]; // preserves characters, spaces, newlines, tabs

  const [typed, setTyped] = useState([]); // array of typed chars
  const [startTs, setStartTs] = useState(null);
  const [endTs, setEndTs] = useState(null);
  const [finished, setFinished] = useState(false);
  const containerRef = useRef(null);

  // keep focus on invisible input
  const hiddenInputRef = useRef(null);

  useEffect(() => {
    // reset when problem changes
    setTyped([]);
    setStartTs(null);
    setEndTs(null);
    setFinished(false);
    // focus input
    setTimeout(() => hiddenInputRef.current && hiddenInputRef.current.focus(), 10);
  }, [problem]);

  // caret index = typed.length (points to next char)
  const caretIndex = typed.length;

  // keep viewport scrolled so caret is visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cursorEl = el.querySelector(".char.cursor");
    if (cursorEl) cursorEl.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
  }, [caretIndex]);

  function startIfNeeded() {
    if (!startTs) setStartTs(Date.now());
  }

  function finishIfNeeded() {
    if (typed.length >= chars.length && !finished) {
      const now = Date.now();
      setEndTs(now);
      setFinished(true);
      // compute metrics
      const durationMs = now - (startTs || now);
      const typedStr = typed.join("");
      const wpm = calcWPM(typedStr.length, durationMs);
      const accuracy = calcAccuracy(chars, typed);
      const attempt = {
        user: localStorage.getItem("nick") || "anon",
        problemId: problem.id,
        wpm,
        accuracy,
        rawText: typedStr,
        durationMs,
      };
      if (autoSubmit) {
        // POST to backend
        fetch("/api/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt),
        }).catch((e) => console.error("failed to save attempt", e));
      }
      if (onSubmitAttempt) onSubmitAttempt(attempt);
    }
  }

  // handle key input via keydown for full control
  function handleKeyDown(e) {
    // block paste shortcuts (Ctrl/Cmd+V)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      return;
    }

    // do not let browser act on Tab
    if (e.key === "Tab") e.preventDefault();

    // start timer on first key
    startIfNeeded();

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      // printable character
      e.preventDefault();
      // handle Enter and Tab as characters: key will be '\n' or '\t' only in special cases,
      // but here e.key is the actual char; to preserve exact comparison, convert '\r' to '\n'
      let char = e.key;
      if (char === "\r") char = "\n";
      // For consistency, treat the Tab key as 4 spaces if user pressed Tab (we handle below)
      if (e.key === " ") {
        // normal space
      }
      // push typed char
      setTyped((t) => {
        const next = [...t, char];
        // if we overshoot length, allow (but finish triggers when >=)
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      setTyped((t) => [...t, "\n"]);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setTyped((t) => {
        if (t.length === 0) return t;
        const next = t.slice(0, t.length - 1);
        return next;
      });
    } else if (e.key === "Tab") {
      // insert 4 spaces
      e.preventDefault();
      setTyped((t) => [...t, " ", " ", " ", " "]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // reset test
      setTyped([]);
      setStartTs(null);
      setEndTs(null);
      setFinished(false);
    } else {
      // ignore other keys (Arrow keys, etc.)
    }
  }

  // compute metrics helpers
  function calcWPM(charsCount, ms) {
    const words = charsCount / 5;
    const minutes = ms / 60000;
    return minutes > 0 ? Math.round(words / minutes) : 0;
  }
  function calcAccuracy(expectedArr, typedArr) {
    if (!typedArr || typedArr.length === 0) return 100;
    let correct = 0;
    for (let i = 0; i < typedArr.length; i++) {
      if (i >= expectedArr.length) break;
      if (typedArr[i] === expectedArr[i]) correct++;
    }
    return Math.round((correct / typedArr.length) * 100);
  }

  // update finish check when typed changes
  useEffect(() => {
    if (startTs && !finished) finishIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  // rendered spans: show class based on correct/incorrect/current/past
  function renderCharSpan(c, idx) {
    const typedChar = typed[idx];
    const isPast = idx < typed.length;
    const isCurrent = idx === caretIndex;
    const classes = ["char"];
    if (isCurrent) classes.push("cursor");
    if (isPast) {
      if (typedChar === c) classes.push("correct");
      else classes.push("incorrect");
    }
    // transform display for whitespace
    let display = c;
    if (c === " ") display = "·"; // visible dot for space (optional)
    if (c === "\n") display = "⏎"; // visible symbol for newline (optional)
    if (c === "\t") display = "⇥"; // visible tab symbol (optional)
    // But we prefer to show actual whitespace visually — use whiteSpace: pre in CSS.
    return (
      <span
        key={idx}
        className={classes.join(" ")}
        data-idx={idx}
        title={c === " " ? "space" : c === "\n" ? "\\n" : c === "\t" ? "\\t" : c}
        aria-hidden="true"
      >
        {c}
      </span>
    );
  }

  // summary metrics computed on the fly
  const elapsedMs = (endTs || Date.now()) - (startTs || Date.now());
  const wpm = startTs ? calcWPM(typed.join("").length, elapsedMs) : 0;
  const accuracy = calcAccuracy(chars, typed);

  return (
    <div className="typing-root" onClick={() => hiddenInputRef.current && hiddenInputRef.current.focus()}>
      <div className="prompt-title">{problem.title}</div>

      <div className="prompt-area" ref={containerRef}>
        <div className="prompt-content" aria-hidden>
          {chars.map((c, i) => renderCharSpan(c, i))}
          {/* if caret is at end, show caret after last char */}
          {caretIndex >= chars.length && <span className="char cursor at-end" />}
        </div>
      </div>

      {/* invisible input captures keystrokes reliably */}
      <input
        ref={hiddenInputRef}
        className="hidden-input"
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          e.preventDefault();
          // don't allow paste
        }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        aria-label="typing input (hidden)"
      />

      <div className="controls">
        <button
          onClick={() => {
            // reset manually
            setTyped([]);
            setStartTs(null);
            setEndTs(null);
            setFinished(false);
            hiddenInputRef.current && hiddenInputRef.current.focus();
          }}
        >
          Reset
        </button>
        <div className="metrics">
          <div>Elapsed: {Math.round(elapsedMs / 1000)}s</div>
          <div>WPM: {wpm}</div>
          <div>Accuracy: {accuracy}%</div>
        </div>
      </div>

      <style jsx="true">{`
        .typing-root { color: #e6eef3; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace; }
        .prompt-title { font-size: 20px; margin-bottom: 8px; color: #fff; }
        .prompt-area { background:#212426; border:1px solid #2f3336; padding:12px; border-radius:8px; max-height:360px; overflow:auto; }
        .prompt-content { display:flex; flex-wrap:wrap; gap:0; white-space:pre-wrap; font-size:16px; line-height:1.5; }
        .prompt-content .char { padding:2px 0; margin:0; display:inline-block; min-width:8px; }
        .prompt-content .char.correct { color:#9be19b; background: rgba(155,225,155,0.04); }
        .prompt-content .char.incorrect { color:#ffb4b4; background: rgba(255,128,128,0.03); text-decoration:underline wavy rgba(255,80,80,0.3); }
        .prompt-content .char.cursor { position: relative; }
        /* caret (left border) */
        .prompt-content .char.cursor::after {
          content: "";
          position: absolute;
          left: 0;
          top: 2px;
          bottom: 2px;
          width: 2px;
          background: #9be0ff;
          animation: blink 1s steps(2, start) infinite;
        }
        .prompt-content .char.at-end::after { left: -2px; } /* caret when at end */
        @keyframes blink { 50% { opacity: 0; } }
        .hidden-input { position: absolute; opacity: 0; left: -9999px; width: 1px; height: 1px; }
        .controls { display:flex; justify-content:space-between; align-items:center; margin-top:12px; }
        .metrics { display:flex; gap:12px; color:#bfc9cf; font-size:14px; }
        button { background:#2b3133; color:#fff; border:1px solid #3b4143; padding:6px 10px; border-radius:6px; cursor:pointer; }
        button:hover { filter:brightness(1.06); }
      `}</style>
    </div>
  );
}
