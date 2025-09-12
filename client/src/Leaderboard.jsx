import React, {useEffect, useState} from "react";

export default function Leaderboard({problemId}){
  const [list,setList] = useState([]);
  useEffect(()=> {
    if (!problemId) return;
    fetch(`http://localhost:4001/api/leaderboard?problemId=${problemId}`)
      .then(r=>r.json()).then(setList).catch(err=>console.error(err));
  }, [problemId]);
  return (
    <div>
      <h3>Leaderboard</h3>
      <ol>
        {list.map(a=>(
          <li key={a.id} style={{marginBottom:6}}>
            <strong>{a.wpm} wpm</strong> — {a.accuracy}% — <span style={{fontSize:12,color:'#666'}}>{new Date(a.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
