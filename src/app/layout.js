"use client";
import { useState, useEffect } from "react";
import "./globals.css";

export default function RootLayout({ children }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <html lang="en">
      <body>
        <div className="header container">
          <div className="brand">
            <h1 className="title">File Converter</h1>
            <p className="subtitle">Convert & auto-enhance files easily</p>
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
