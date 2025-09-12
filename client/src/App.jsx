import React, {useEffect, useState} from "react";
import ProblemList from "./ProblemList";
import TypingCanvas from "./TypingCanvas";
import Leaderboard from "./Leaderboard";
import TypingFast from "./TypingFast";
import TypingFastCached from "./TypingFastCached";

import TypingTest from "./TypingTest";

function App(){
  const [problems, setProblems] = useState([]);
  const [selected, setSelected] = useState(null);
  useEffect(()=> {
    fetch("http://localhost:4001/api/problems")
      .then(r=>r.json())
      .then(setProblems)
      .catch(err=>console.error(err));
  }, []);
  return (
    <div style={{padding:20,fontFamily:'Inter, Arial'}}>
      <h1>Typing MVP</h1>
      <div style={{display:'flex',gap:20}}>
        <div style={{width:320}}>
          <ProblemList problems={problems} onSelect={setSelected} selected={selected}/>
        </div>
        <div style={{flex:1}}>
          {selected ? <TypingFastCached problem={selected} /> : <div>Select a problem on left</div>}
        </div>
        <div style={{width:300}}>
          {selected && <Leaderboard problemId={selected.id} />}
        </div>
      </div>
      <div style={{marginTop: 32}}>
        <TypingTest />
      </div>
    </div>
  );
}

export default App;
