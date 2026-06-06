"use client";
import { useState, useEffect, useRef } from "react";

// Use environment variable for production (e.g. VPS backend), fallback to local Next.js proxy rewrite for dev
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

type Result = {
  email: string;
  url: string | null;
  status: "✅" | "❌";
};

type Stats = {
  total: number;
  processed: number;
  found: number;
  failed: number;
  status: "idle" | "processing" | "completed";
  results: Result[];
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    processed: 0,
    found: 0,
    failed: 0,
    status: "idle",
    results: [],
  });
  const [filter, setFilter] = useState<"all" | "✅" | "❌">("all");
  const [isHovering, setIsHovering] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);
  const resultsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (resultsEndRef.current) {
      resultsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [stats.results]);

  useEffect(() => {
    if (stats.status === "processing") {
      pollInterval.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/stats`);
          const data = await res.json();
          setStats(data);
          if (data.status === "completed") {
            clearInterval(pollInterval.current!);
          }
        } catch (e) {
          // Silently ignore network failures to prevent Next.js from forwarding console warnings to the terminal
        }
      }, 500);
    }
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [stats.status]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovering(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const startProcessing = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);

    try {
      await fetch(`${API_URL}/start`, {
        method: "POST",
        body: formData,
      });
      setStats((s) => ({ ...s, status: "processing", results: [] }));
      setFilter("all");
    } catch (e) {
      alert("Failed to connect to backend engine.");
    }
  };

  const downloadResults = (format: "txt" | "csv" | "pdf") => {
    const data = stats.results.filter((r) => filter === "all" || r.status === filter);
    if (data.length === 0) return alert("No results to download for current filter");

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `sorter-results-${filter === "all" ? "full" : filter === "✅" ? "webmail" : "failed"}-${timestamp}`;

    if (format === "csv") {
      const csv = ["Email,URL,Status", ...data.map((r) => `"${r.email}","${r.url || ""}","${r.status}"`)].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.csv`;
      a.click();
    } else if (format === "txt") {
      const txt = data.map((r) => `${r.email}${r.url ? ` : ${r.url}` : ""}${r.status === "❌" ? " (FAILED)" : ""}`).join("\n");
      const blob = new Blob([txt], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}.txt`;
      a.click();
    } else if (format === "pdf") {
      // PDF generation via window.print() of a temporary window
      const printWindow = window.open("", "_blank");
      if (!printWindow) return alert("Please allow popups for PDF generation");

      const rows = data.map(r => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 10px;">${r.status}</td>
          <td style="padding: 10px;">${r.email}</td>
          <td style="padding: 10px;">${r.url || "N/A"}</td>
        </tr>
      `).join("");

      printWindow.document.write(`
        <html>
          <head>
            <title>COZYSPACECLOUD SORTER Results</title>
            <style>
              body { font-family: sans-serif; padding: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th { background: #f4f4f4; text-align: left; padding: 12px; }
            </style>
          </head>
          <body>
            <h1>COZYSPACECLOUD SORTER - ${filter === "all" ? "All Results" : filter === "✅" ? "Webmail Results" : "Failed Results"}</h1>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            <table>
              <thead>
                <tr><th>Status</th><th>Email</th><th>Webmail URL</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const filteredResults = stats.results.filter(r => filter === "all" || r.status === filter);

  return (
    <main style={styles.main}>
      {/* Header */}
      <header style={styles.header} className="animate-fade-in">
        <div style={styles.logoContainer}>
          <div style={styles.logoIcon}>☄️</div>
          <div>
            <h1 style={styles.title}>COZYSPACECLOUD SORTER</h1>
            <p style={styles.subtitle}>cPanel Edition</p>
          </div>
        </div>
        <div style={styles.statusBadge(stats.status)}>
          {stats.status === "processing" ? "● Analyzing..." : stats.status === "completed" ? "✓ Finished" : "Idle"}
        </div>
      </header>

      <div style={styles.content}>
        {/* Left Column: Upload & Stats */}
        <div style={styles.leftCol}>
          {/* Upload Card */}
          <div className="glass-panel animate-fade-in" style={styles.card}>
            <h2 style={styles.cardTitle}>Source Data</h2>
            <div
              style={{ ...styles.dropzone, border: isHovering ? "2px dashed var(--accent-primary)" : "2px dashed var(--border-color)" }}
              onDragOver={(e) => { e.preventDefault(); setIsHovering(true); }}
              onDragLeave={() => setIsHovering(false)}
              onDrop={handleDrop}
            >
              <input type="file" id="file" onChange={handleFileUpload} accept=".txt,.csv" style={{ display: "none" }} />
              <label htmlFor="file" style={styles.uploadLabel}>
                <span style={{ fontSize: "2rem", marginBottom: "1rem" }}>📂</span>
                {file ? <strong style={{ color: "var(--accent-primary)" }}>{file.name}</strong> : "Click or Drag & Drop .txt / .csv"}
              </label>
            </div>

            <button
              onClick={startProcessing}
              style={{ ...styles.button, opacity: (!file || stats.status === "processing") ? 0.5 : 1 }}
              disabled={!file || stats.status === "processing"}
            >
              {stats.status === "processing" ? "Processing..." : "Start Sorting"}
            </button>
          </div>

          {/* Stats Overview */}
          <div className="glass-panel animate-fade-in" style={{ ...styles.card, animationDelay: "0.1s" }}>
            <h2 style={styles.cardTitle}>Overview</h2>
            <div style={styles.statsGrid}>
              <div
                style={{ ...styles.statBox, cursor: "pointer", outline: filter === "all" ? "2px solid var(--accent-primary)" : "none" }}
                onClick={() => setFilter("all")}
              >
                <div style={styles.statLabel}>Total</div>
                <div style={styles.statValue}>{stats.total}</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Processed</div>
                <div style={styles.statValue}>{stats.processed}</div>
              </div>
              <div
                style={{
                  ...styles.statBox,
                  borderColor: "var(--success-glow)",
                  cursor: "pointer",
                  outline: filter === "✅" ? "2px solid var(--success)" : "none",
                  boxShadow: filter === "✅" ? "0 0 15px var(--success-glow)" : "none"
                }}
                onClick={() => setFilter("✅")}
              >
                <div style={styles.statLabel}>✅ Webmail</div>
                <div style={{ ...styles.statValue, color: "var(--success)" }}>{stats.found}</div>
              </div>
              <div
                style={{
                  ...styles.statBox,
                  borderColor: "var(--error-glow)",
                  cursor: "pointer",
                  outline: filter === "❌" ? "2px solid var(--error)" : "none",
                  boxShadow: filter === "❌" ? "0 0 15px var(--error-glow)" : "none"
                }}
                onClick={() => setFilter("❌")}
              >
                <div style={styles.statLabel}>❌ Failed</div>
                <div style={{ ...styles.statValue, color: "var(--error)" }}>{stats.failed}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Console output */}
        <div className="glass-panel animate-fade-in" style={{ ...styles.consoleCard, animationDelay: "0.2s" }}>
          <div style={styles.consoleHeader}>
            <div>
              <h2 style={styles.cardTitle}>Live Validation Console</h2>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "-0.5rem", marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Showing: <strong style={{ color: "var(--accent-primary)" }}>{filter.toUpperCase()}</strong> ({filteredResults.length})
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={() => downloadResults("txt")} style={styles.downloadBtn}>TXT</button>
              <button onClick={() => downloadResults("csv")} style={styles.downloadBtn}>CSV</button>
              <button onClick={() => downloadResults("pdf")} style={styles.downloadBtn}>PDF</button>
            </div>
            <div style={styles.progressText}>
              {stats.total > 0 ? `${Math.round((stats.processed / stats.total) * 100)}%` : "0%"}
            </div>
          </div>
          <div style={styles.progressBarBg}>
            <div style={{ ...styles.progressBarFill, width: `${stats.total > 0 ? (stats.processed / stats.total) * 100 : 0}%` }} />
          </div>

          <div style={styles.consoleLog}>
            {filteredResults.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                {stats.results.length === 0 ? "Awaiting input..." : "No results matching filter..."}
              </div>
            )}
            {filteredResults.map((req, i) => (
              <div key={i} style={styles.logRow} className="animate-fade-in">
                <span style={{ color: req.status === "✅" ? "var(--success)" : "var(--error)", width: "24px" }}>{req.status}</span>
                <span style={{ color: "var(--text-main)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{req.email}</span>
                {req.url && <span style={{ color: "var(--accent-primary)", fontSize: "0.85rem" }}>{req.url}</span>}
              </div>
            ))}
            <div ref={resultsEndRef} />
          </div>
        </div>
      </div>
    </main>
  );
}

const styles = {
  main: {
    padding: "2rem",
    maxWidth: "1400px",
    margin: "0 auto",
    width: "100%",
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2.5rem",
    paddingBottom: "1.5rem",
    borderBottom: "1px solid var(--border-color)",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
  },
  logoIcon: {
    fontSize: "2.5rem",
    background: "linear-gradient(135deg, var(--accent-primary), #3b82f6)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    filter: "drop-shadow(0 0 8px var(--accent-glow))",
  },
  title: {
    fontSize: "1.8rem",
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    color: "var(--text-muted)",
    fontSize: "0.9rem",
    textTransform: "uppercase" as const,
    letterSpacing: "1px",
    fontWeight: 600,
  },
  statusBadge: (status: string) => ({
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: 600,
    color: status === "processing" ? "#3b82f6" : status === "completed" ? "var(--success)" : "var(--text-muted)",
    backgroundColor: status === "processing" ? "rgba(59, 130, 246, 0.1)" : status === "completed" ? "var(--success-glow)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${status === "processing" ? "rgba(59, 130, 246, 0.2)" : status === "completed" ? "rgba(16, 185, 129, 0.2)" : "var(--border-color)"}`,
    animation: status === "processing" ? "pulseGlow 2s infinite" : "none",
  }),
  content: {
    display: "grid",
    gridTemplateColumns: "350px 1fr",
    gap: "2rem",
    flex: 1,
  },
  leftCol: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "2rem",
  },
  consoleCard: {
    display: "flex",
    flexDirection: "column" as const,
    padding: "1.5rem",
    height: "100%",
  },
  card: {
    padding: "1.5rem",
  },
  cardTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    marginBottom: "1.2rem",
    color: "#fff",
  },
  dropzone: {
    padding: "3rem 1rem",
    borderRadius: "12px",
    background: "rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    marginBottom: "1.5rem",
  },
  uploadLabel: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    cursor: "pointer",
    color: "var(--text-muted)",
  },
  button: {
    width: "100%",
    padding: "0.8rem",
    borderRadius: "8px",
    border: "none",
    background: "linear-gradient(135deg, var(--accent-primary), #4c1d95)",
    color: "white",
    fontWeight: 600,
    fontSize: "1rem",
    boxShadow: "0 4px 14px var(--accent-glow)",
    transition: "all 0.2s ease",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
  },
  statBox: {
    background: "rgba(0,0,0,0.4)",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid var(--border-color)",
  },
  statLabel: {
    fontSize: "0.8rem",
    color: "var(--text-muted)",
    marginBottom: "0.5rem",
  },
  statValue: {
    fontSize: "1.5rem",
    fontWeight: 700,
  },
  consoleHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1rem",
  },
  progressText: {
    fontSize: "0.9rem",
    color: "var(--text-muted)",
  },
  progressBarBg: {
    width: "100%",
    height: "4px",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "2px",
    marginBottom: "1rem",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, var(--accent-primary), #3b82f6)",
    transition: "width 0.3s ease",
  },
  consoleLog: {
    flex: 1,
    background: "rgba(0,0,0,0.5)",
    borderRadius: "8px",
    padding: "1rem",
    overflowY: "auto" as const,
    border: "1px solid var(--border-color)",
    maxHeight: "500px",
    fontFamily: "monospace",
  },
  logRow: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.4rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    fontSize: "0.9rem",
  },
  downloadBtn: {
    padding: "4px 8px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid var(--border-color)",
    borderRadius: "4px",
    color: "var(--text-muted)",
    fontSize: "0.75rem",
    cursor: "pointer",
    fontWeight: 600,
    transition: "all 0.2s ease",
    ":hover": {
      background: "rgba(255,255,255,0.1)",
      color: "white"
    }
  }
};
