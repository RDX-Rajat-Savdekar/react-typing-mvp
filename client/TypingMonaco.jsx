// client/src/TypingMonaco.jsx
import React, { useEffect, useRef, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";

/**
 * TypingMonaco
 * Props:
 *  - problem: { id, title, text }
 *  - autoSubmit (default true)
 *  - onSubmitAttempt(optional)
 *
 * Pattern: Monaco renders the prompt (readOnly). Typing captured via hidden input and we update
 * decorations on the prompt model to mark correct / incorrect spans + caret.
 */

export default function TypingMonaco({ problem, autoSubmit = true, onSubmitAttempt }) {
  const monaco = useMonaco();
  const editorRef = useRef(null);
  const modelRef = useRef(null);
  const [typed, setTyped] = useState([]); // array of chars user typed
  const [startTs, setStartTs] = useState(null);
  const [endTs, setEndTs] = useState(null);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef(null);
  const decorationsRef = useRef([]); // store decoration ids

  // build char array of prompt
  const text = problem?.text ?? "";
  const chars = [...text]; // preserves all characters

  useEffect(() => {
    // reset on problem change
    setTyped([]);
    setStartTs(null);
    setEndTs(null);
    setFinished(false);
    decorationsRef.current = [];
    // focus hidden input after small delay so editor is ready
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
  }, [problem]);

  // when monaco loaded and editor mounted, create model (readOnly)
  function handleEditorDidMount(editor, monacoApi) {
    editorRef.current = editor;
    // create model for the prompt text
    const model = monacoApi.editor.getModel(monacoApi.Uri.parse(`inmemory://model/${problem.id}`))
      || monacoApi.editor.createModel(text, "plaintext", monacoApi.Uri.parse(`inmemory://model/${problem.id}`));
    modelRef.current = model;
    editor.setModel(model);
    editor.updateOptions({ readOnly: true, minimap: { enabled: false } });
  }

  // Helpers: map char index to Monaco position {lineNumber, column}
  function indexToPosition(idx) {
    // Monaco uses 1-based lineNumber & column
    // Split text into lines and find which line contains the character at idx
    const before = text.slice(0, idx);
    const lines = before.split("\n");
    const lineNumber = lines.length;
    const column = lines[lines.length - 1].length + 1; // columns are 1-based
    return { lineNumber, column };
  }

  // Make a single-char range at index
  function rangeForIndex(idx) {
    const start = indexToPosition(idx);
    const end = indexToPosition(idx + 1);
    return new monaco.editor.Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }

  // Compute decorations: for each typed char, mark correct/incorrect. Also caret decoration.
  function updateDecorations() {
    if (!editorRef.current || !monaco) return;
    const decs = [];
    for (let i = 0; i < typed.length; i++) {
      const expected = chars[i];
      const got = typed[i];
      // create range for position i
      const start = indexToPosition(i);
      const end = indexToPosition(i + 1);
      const range = new monaco.editor.Range(start.lineNumber, start.column, end.lineNumber, end.column);
      if (got === expected) {
        decs.push({
          range,
          options: { inlineClassName: "mt-char-correct" },
        });
      } else {
        decs.push({
          range,
          options: { inlineClassName: "mt-char-incorrect" },
        });
      }
    }

    // caret decoration at typed.length (if not finished)
    if (!finished) {
      const caretPos = typed.length;
      const start = indexToPosition(caretPos);
      const end = indexToPosition(Math.min(caretPos + 1, chars.length));
      const range = new monaco.editor.Range(start.lineNumber, start.column, end.lineNumber, end.column);
      // wide caret decoration (zero-width) implemented via beforeContentClassName
      decs.push({
        range,
        options: { className: "mt-caret-range", isWholeLine: false, beforeContentClassName: "mt-caret" },
      });
    }

    // apply delta
    decorationsRef.current = editorRef.current.deltaDecorations(decorationsRef.current, decs);
  }

  // start timer
  function startIfNeeded() {
    if (!startTs) setStartTs(Date.now());
  }

  // finish
  function finishIfNeeded() {
    if (typed.length >= chars.length && !finished) {
      const now = Date.now();
      setEndTs(now);
      setFinished(true);
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
        fetch("/api/attempts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt),
        }).catch((e) => console.error("save attempt failed", e));
      }
      if (onSubmitAttempt) onSubmitAttempt(attempt);
    }
  }

  // handle keydown from hidden input
  function handleKeyDown(e) {
    // block paste and ctrl/meta combos that paste
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      return;
    }
    startIfNeeded();

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setTyped((t) => {
        const next = [...t, e.key];
        return next;
      });
    } else if (e.key === "Backspace") {
      e.preventDefault();
      setTyped((t) => {
        if (t.length === 0) return t;
        const next = t.slice(0, t.length - 1);
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      setTyped((t) => [...t, "\n"]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      setTyped((t) => [...t, " ", " ", " ", " "]); // treat tab as 4 spaces
    } else if (e.key === "Escape") {
      e.preventDefault();
      // reset
      setTyped([]);
      setStartTs(null);
      setEndTs(null);
      setFinished(false);
      decorationsRef.current = [];
    } else {
      // ignore arrows, home, end, etc.
    }
  }

  // recompute decorations when typed changes
  useEffect(() => {
    if (!monaco || !editorRef.current) return;
    updateDecorations();
    finishIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, monaco, finished]);

  // metrics helpers
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

  const elapsedMs = (endTs || Date.now()) - (startTs || Date.now());
  const wpm = startTs ? calcWPM(typed.join("").length, elapsedMs) : 0;
  const accuracy = calcAccuracy(chars, typed);

  return (
    <div onClick={() => inputRef.current && inputRef.current.focus()} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>{problem.title}</h2>
        <div style={{ color: "#9aa6b2" }}>
          <div>WPM: {wpm}</div>
          <div>Accuracy: {accuracy}%</div>
        </div>
      </div>

      <div style={{ border: "1px solid #2f3336", borderRadius: 8, overflow: "hidden" }}>
        <Editor
          height="260px"
          defaultLanguage="plaintext"
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            readOnly: true,
            lineNumbers: "off",
            minimap: { enabled: false },
            glyphMargin: false,
            folding: false,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderWhitespace: "all",
            wordWrap: "on",
          }}
          value={text}
        />
      </div>

      <input
        ref={inputRef}
        onKeyDown={handleKeyDown}
        onPaste={(e) => e.preventDefault()}
        style={{ position: "absolute", opacity: 0, left: -9999 }}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <div style={{ color: "#bfc9cf" }}>Elapsed: {Math.round(elapsedMs / 1000)}s</div>
        <div>
          <button
            onClick={() => {
              setTyped([]);
              setStartTs(null);
              setEndTs(null);
              setFinished(false);
              decorationsRef.current = [];
              inputRef.current && inputRef.current.focus();
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* CSS for decorations: inline for convenience */}
      <style>{`
        .mt-char-correct { background-color: rgba(22, 145, 82, 0.12) !important; color: #9be19b !important; }
        .mt-char-incorrect { background-color: rgba(255, 90, 90, 0.06) !important; color: #ffb4b4 !important; text-decoration: underline wavy rgba(255,80,80,0.18); }
        .mt-caret { display:inline-block; border-left:2px solid #9be0ff; animation: mt-blink 1s steps(2,start) infinite; height:1em; vertical-align: bottom; }
        @keyframes mt-blink { 50% { opacity: 0; } }
        .mt-caret-range {} /* optional */
        button { background:#2b3133; color:#fff; border:1px solid #3b4143; padding:6px 10px; border-radius:6px; cursor:pointer; }
      `}</style>
    </div>
  );
}
