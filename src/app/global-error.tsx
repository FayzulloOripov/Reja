"use client";

// Last-resort boundary when the root layout itself fails (no providers available here).
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="uz">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, background: "#faf7f2", color: "#231d17" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 22 }}>Nimadir notoʻgʻri ketdi · Something went wrong</h1>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 10, border: 0, background: "#b8501d", color: "#fff", fontSize: 15 }}>
            Qayta urinish · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
