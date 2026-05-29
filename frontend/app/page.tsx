"use client";

import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("undergrad");
  const [loading, setLoading] = useState(false);
  const [papers, setPapers] = useState<any[]>([]);
  const [synthesis, setSynthesis] = useState("");

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, level })
      });
      const data = await response.json();
      setPapers(data.papers || []);
      setSynthesis(data.synthesis || "");
    } catch (error) {
      console.error("Error:", error);
    }
    setLoading(false);
  };

  return (
    <main style={{ background: "#06060f", minHeight: "100vh", color: "white", fontFamily: "monospace", padding: "40px" }}>
      <h1 style={{ color: "#7c6fff", fontSize: "32px", marginBottom: "8px" }}>RESEARCA</h1>
      <p style={{ color: "#888", marginBottom: "32px" }}>AI Research OS</p>
      
      <div style={{ maxWidth: "600px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="What do you want to research?"
          style={{ width: "100%", padding: "14px", background: "#0d0d1f", border: "0.5px solid #2a2a3e", borderRadius: "8px", color: "white", fontSize: "14px", marginBottom: "12px" }}
        />
        
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{ padding: "10px", background: "#0d0d1f", border: "0.5px solid #2a2a3e", borderRadius: "8px", color: "white", marginBottom: "12px" }}
        >
          <option value="highschool">High School</option>
          <option value="undergrad">Undergrad</option>
          <option value="phd">PhD</option>
        </select>
        
        <button
          onClick={handleSearch}
          style={{ display: "block", padding: "12px 28px", background: "#7c6fff", border: "none", borderRadius: "8px", color: "white", cursor: "pointer", fontSize: "14px" }}
        >
          {loading ? "Researching..." : "Search"}
        </button>

        {synthesis && (
          <div style={{ maxWidth: "800px", marginTop: "40px" }}>
            <div style={{ background: "#0d0d1f", border: "0.5px solid #7c6fff", borderRadius: "8px", padding: "24px", marginBottom: "24px" }}>
              <h2 style={{ color: "#7c6fff", marginBottom: "16px", fontSize: "12px", letterSpacing: "2px" }}>AI SYNTHESIS</h2>
              <p style={{ color: "#ccc", lineHeight: "1.8", fontSize: "14px", whiteSpace: "pre-wrap" }}>{synthesis}</p>
            </div>

            <h2 style={{ color: "#888", fontSize: "11px", letterSpacing: "2px", marginBottom: "12px" }}>PAPERS</h2>
            {papers.map((paper: any, i: number) => (
              <div key={i} style={{ background: "#0d0d1f", border: "0.5px solid #1a1a2e", borderRadius: "8px", padding: "16px", marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <p style={{ color: "#ccc", fontSize: "13px", flex: 1 }}>{paper.title}</p>
                  <span style={{ color: "#7c6fff", fontSize: "11px", border: "0.5px solid #7c6fff", borderRadius: "4px", padding: "2px 6px", marginLeft: "12px", whiteSpace: "nowrap" }}>{paper.year}</span>
                </div>
                <p style={{ color: "#555", fontSize: "11px", marginTop: "4px" }}>{paper.citationCount} citations</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}