import React, { useState, useEffect } from "react";

const sampleText = "the quick brown fox jumps over the lazy dog";

export default function TypingTest() {
  const [text, setText] = useState(sampleText.split("")); // array of chars
  const [typed, setTyped] = useState([]); // what user has typed
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleKeyDown = (e) => {
    if (e.key.length === 1) {
      // letter/space
      setTyped((prev) => [...prev, e.key]);
      setCurrentIndex((prev) => prev + 1);
    } else if (e.key === "Backspace" && currentIndex > 0) {
      setTyped((prev) => prev.slice(0, -1));
      setCurrentIndex((prev) => prev - 1);
    }
  };

  // start listening to keystrokes
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex]);

  const restartTest = () => {
    setTyped([]);
    setCurrentIndex(0);
  };

  return (
    <div className="p-6 font-mono text-xl">
      <div className="flex flex-wrap gap-1 mb-4">
        {text.map((char, idx) => {
          let status = "";
          if (idx < typed.length) {
            status =
              typed[idx] === char
                ? "text-green-500"
                : "text-red-500 underline";
          }
          return (
            <span key={idx} className={status}>
              {char}
            </span>
          );
        })}
      </div>

      <button
        onClick={restartTest}
        className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
      >
        Restart
      </button>
    </div>
  );
}
