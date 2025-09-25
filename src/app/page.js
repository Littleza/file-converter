"use client";

import { useEffect, useRef, useState } from "react";

// ---------- helpers ----------
async function loadImageBitmap(file) {
  const blobUrl = URL.createObjectURL(file);
  const img = await fetch(blobUrl)
    .then(r => r.blob())
    .then(b => createImageBitmap(b));
  URL.revokeObjectURL(blobUrl);
  return img;
}

function createCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function removeBackground(canvas, t = 240) {
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r >= t && g >= t && b >= t) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawWatermark(canvas, text, size = 28) {
  const ctx = canvas.getContext("2d");
  const pad = 10;
  ctx.font = `${size}px Inter, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.textBaseline = "bottom";
  const w = ctx.measureText(text).width;
  ctx.fillText(text, canvas.width - w - pad, canvas.height - pad);
}

function canvasToBlob(canvas, mime, q = 0.9) {
  return new Promise(resolve => {
    if (canvas.convertToBlob) {
      canvas.convertToBlob({ type: mime, quality: q }).then(resolve);
    } else {
      canvas.toBlob(resolve, mime, q);
    }
  });
}

// ---------- main ----------
export default function Home() {
  // login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [files, setFiles] = useState([]);
  const [isImageMode, setIsImageMode] = useState(true);
  const [imageFormat, setImageFormat] = useState("png");
  const [imageQuality, setImageQuality] = useState(0.9);
  const [resizeWidth, setResizeWidth] = useState(800);
  const [removeBg, setRemoveBg] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState("© MySite");
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [audioFormat, setAudioFormat] = useState("mp3");
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [modalImage, setModalImage] = useState(null);

  const ffmpegRef = useRef(null);
  const JSZipRef = useRef(null);
  const ID3WriterRef = useRef(null);

  useEffect(() => {
    async function loadLibs() {
      if (typeof window !== "undefined") {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg");
        ffmpegRef.current = new FFmpeg();
        const JSZip = (await import("jszip")).default;
        JSZipRef.current = JSZip;
        const ID3Writer = (await import("browser-id3-writer")).default;
        ID3WriterRef.current = ID3Writer;
      }
    }
    loadLibs();
  }, []);

  // ตรวจสอบ login จาก localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("loggedIn");
      if (saved === "true") setIsLoggedIn(true);
    }
  }, []);

  function handleLogin(e) {
    e.preventDefault();
    // ไม่ตรวจจริงแค่ผ่าน
    localStorage.setItem("loggedIn", "true");
    setIsLoggedIn(true);
  }

  function handleLogout() {
    localStorage.removeItem("loggedIn");
    setIsLoggedIn(false);
  }

  function handleChange(e) {
    const fs = Array.from(e.target.files || []);
    setFiles(fs);
    if (fs[0]) {
      if (fs[0].type.startsWith("image/")) setIsImageMode(true);
      else if (fs[0].type.startsWith("audio/")) setIsImageMode(false);
    }
  }

  function addHistory(item) {
    const newItem = {
      id: Date.now() + Math.random(),
      filename: item.name,
      type: item.type,
      size: item.blob.size,
      url: item.url,
      created_at: new Date().toISOString()
    };
    setHistory(prev => [newItem, ...prev]);
  }

  async function processImages(imgs) {
    const out = [];
    for (let i = 0; i < imgs.length; i++) {
      const f = imgs[i];
      setStatus(`Image ${i + 1}/${imgs.length}: ${f.name}`);
      const bmp = await loadImageBitmap(f);
      const ratio = resizeWidth ? resizeWidth / bmp.width : 1;
      const w = resizeWidth ? Math.round(bmp.width * ratio) : bmp.width;
      const h = resizeWidth ? Math.round(bmp.height * ratio) : bmp.height;
      const canvas = createCanvas(w, h);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bmp, 0, 0, w, h);
      if (removeBg) removeBackground(canvas, 240);
      if (watermark) drawWatermark(canvas, watermarkText, 20);
      const mime = imageFormat === "jpg" ? "image/jpeg" :
        imageFormat === "webp" ? "image/webp" : "image/png";
      const blob = await canvasToBlob(canvas, mime, imageQuality);
      out.push({ name: f.name.replace(/\..+$/, "") + "." + imageFormat, blob, type: mime });
    }
    return out;
  }

  async function processAudios(auds) {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) throw new Error("FFmpeg not loaded");
    if (!ffmpeg.loaded) {
      setStatus("Loading ffmpeg...");
      await ffmpeg.load();
    }
    const out = [];
    for (let i = 0; i < auds.length; i++) {
      const f = auds[i];
      setStatus(`Audio ${i + 1}/${auds.length}: ${f.name}`);
      const inName = `in_${i}_${f.name}`;
      await ffmpeg.writeFile(inName, new Uint8Array(await f.arrayBuffer()));
      const outName = `out_${i}.${audioFormat}`;
      const args = ["-i", inName];
      if (autoEnhance) {
        args.push("-af", "loudnorm,afftdn,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.5");
      }
      args.push(outName);
      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile(outName);
      const blob = new Blob([data.buffer], { type: "audio/" + audioFormat });
      out.push({ name: f.name.replace(/\..+$/, "") + "." + audioFormat, blob, type: "audio/" + audioFormat });
    }
    return out;
  }

  async function handleConvert(e) {
    e.preventDefault();
    if (!files.length) return alert("Pick files first");
    setProcessing(true);
    setResults([]);
    try {
      let out = [];
      if (isImageMode) {
        out = await processImages(files.filter(f => f.type.startsWith("image/")));
      } else {
        out = await processAudios(files.filter(f => f.type.startsWith("audio/")));
      }
      out = out.map(o => ({ ...o, url: URL.createObjectURL(o.blob) }));
      setResults(out);
      out.forEach(addHistory);
      setStatus("Done.");
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function downloadZip() {
    const JSZip = JSZipRef.current;
    if (!JSZip) return alert("JSZip not loaded");
    const zip = new JSZip();
    results.forEach(r => zip.file(r.name, r.blob));
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = "converted.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isLoggedIn) {
    // หน้า login ที่ได้รับการปรับปรุง
    return (
      <div className="login-container">
        <div className="login-background">
          <div className="floating-shapes">
            <div className="shape shape-1"></div>
            <div className="shape shape-2"></div>
            <div className="shape shape-3"></div>
          </div>
        </div>
        
        <div className="login-card fade-in-up">
          <div className="login-header">
            <h2 className="login-title">Welcome Back</h2>
            <p className="login-subtitle">Sign in to your account</p>
          </div>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-field">
              <label htmlFor="username">Username</label>
              <input 
                id="username"
                type="text" 
                placeholder="Enter your username" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                className="login-input"
                required
              />
            </div>
            
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input 
                id="password"
                type="password" 
                placeholder="Enter your password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="login-input"
                required
              />
            </div>
            
            <button type="submit" className="login-button">
              <span>Sign In</span>
              <div className="button-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </button>
          </form>
          
          <div className="login-footer">
            <p>Don't have an account? <a href="#" className="footer-link">Sign up</a></p>
          </div>
        </div>
        
        
      </div>
    );
  }

  // หน้าแอปหลัก
  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="title">File Converter</h1>
        <button onClick={handleLogout}>Logout</button>
      </div>
      <p className="subtitle">Convert & enhance images or audio — all in browser</p>

      <div className="grid">
        {/* Form */}
        <div className="card">
          <form onSubmit={handleConvert}>
            <div className="field">
              <label>Mode</label>
              <select value={isImageMode ? "image" : "audio"} onChange={e => setIsImageMode(e.target.value === "image")}>
                <option value="image">Image</option>
                <option value="audio">Audio</option>
              </select>
            </div>
            <div className="field">
              <label>Files</label>
              <input type="file" multiple onChange={handleChange} accept={isImageMode ? "image/*" : "audio/*"} />
              <div className="small">{files.length} selected</div>
            </div>
            {isImageMode ? (
              <>
                <div className="field">
                  <label>Format</label>
                  <select value={imageFormat} onChange={e => setImageFormat(e.target.value)}>
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                    <option value="webp">WEBP</option>
                  </select>
                </div>
                <div className="field">
                  <label>Quality (0.1 - 1.0)</label>
                  <input type="number" step="0.05" min="0.1" max="1" value={imageQuality}
                    onChange={e => setImageQuality(parseFloat(e.target.value))} />
                </div>
                <div className="field">
                  <label>Resize width</label>
                  <input type="number" value={resizeWidth} onChange={e => setResizeWidth(parseInt(e.target.value) || "")} />
                </div>
                <div className="field">
                  <label><input type="checkbox" checked={removeBg} onChange={e => setRemoveBg(e.target.checked)} /> Remove background</label>
                </div>
                <div className="field">
                  <label><input type="checkbox" checked={watermark} onChange={e => setWatermark(e.target.checked)} /> Watermark</label>
                  {watermark && <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} />}
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label>Format</label>
                  <select value={audioFormat} onChange={e => setAudioFormat(e.target.value)}>
                    <option value="mp3">MP3</option>
                    <option value="wav">WAV</option>
                    <option value="ogg">OGG</option>
                  </select>
                </div>
                <div className="field">
                  <label><input type="checkbox" checked={autoEnhance} onChange={e => setAutoEnhance(e.target.checked)} /> Auto enhance</label>
                </div>
              </>
            )}
            <div className="actions">
              <button type="submit" disabled={processing}>{processing ? "Processing..." : "Convert"}</button>
              <button type="button" onClick={() => { setFiles([]); setResults([]); }}>Reset</button>
            </div>
            <div className="small">Status: {status}</div>
          </form>
        </div>

        {/* Results */}
        <div className="card">
          <h3>Results</h3>
          {results.length === 0 ? (
            <div className="small">No results yet</div>
          ) : (
            <>
              <div className="preview-list">
                {results.map((r, i) => (
                  <div className="preview-item" key={i}>
                    {r.type.startsWith("image") ? (
                      <img src={r.url} alt={r.name} onClick={() => setModalImage(r.url)} style={{ cursor: "pointer" }} />
                    ) : (
                      <audio controls src={r.url} style={{ width: 150 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{r.name}</div>
                      <div className="meta">{(r.blob.size / 1024).toFixed(1)} KB</div>
                      <a className="link" href={r.url} download={r.name}>Download</a>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button onClick={downloadZip}>Download All (.zip)</button>
                <button onClick={() => { results.forEach(r => URL.revokeObjectURL(r.url)); setResults([]); }}>Clear</button>
              </div>
            </>
          )}
        </div>

        {/* History */}
        <div className="card">
          <h3>History</h3>
          {history.length === 0 ? (
            <div className="small">No history yet</div>
          ) : (
            <div className="preview-list">
              {history.map((h, idx) => (
                <div className="preview-item" key={h.id}>
                  {h.type.startsWith("image") && h.url && (
                    <img
                      src={h.url}
                      alt={h.filename}
                      style={{ width: 60, height: 60, objectFit: "cover", marginRight: 8 }}
                      onClick={() => setModalImage(h.url)}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{idx + 1}. {h.filename}</div>
                    <div className="meta">{h.type} — {(h.size / 1024).toFixed(1)} KB</div>
                    <div className="meta">{new Date(h.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalImage && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999
        }} onClick={() => setModalImage(null)}>
          <img src={modalImage} alt="Preview" style={{ maxWidth: "90%", maxHeight: "90%" }} />
        </div>
      )}
    </div>
  );
}