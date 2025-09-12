import React from "react";
export default function ProblemList({problems, onSelect, selected}){
  return (
    <div>
      <h3>Problems</h3>
      <ul style={{listStyle:'none', padding:0}}>
        {problems.map(p=>(
          <li key={p.id} style={{
            marginBottom:8,
            padding:8,
            border: selected && selected.id===p.id ? "2px solid #333" : "1px solid #ddd",
            borderRadius:6,
            cursor:"pointer"
          }} onClick={()=>onSelect(p)}>
            <strong>{p.title}</strong><div style={{fontSize:12,color:'#666'}}>{p.difficulty}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
