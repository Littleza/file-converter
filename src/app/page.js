"use client";

import { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import ID3Writer from "browser-id3-writer";

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

  const ffmpegRef = useRef(null);

  // ✅ โหลด ffmpeg เฉพาะ client
  useEffect(() => {
    async function loadFFmpeg() {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      ffmpegRef.current = new FFmpeg();
    }
    loadFFmpeg();
  }, []);

  function handleChange(e) {
    const fs = Array.from(e.target.files || []);
    setFiles(fs);
    if (fs[0]) {
      if (fs[0].type.startsWith("image/")) setIsImageMode(true);
      else if (fs[0].type.startsWith("audio/")) setIsImageMode(false);
    }
  }

  async function processImages(imgs) {
    const out = [];
    for (let i = 0; i < imgs.length; i++) {
      const f = imgs[i];
      setStatus(`Image ${i+1}/${imgs.length}: ${f.name}`);
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
    if (!ffmpeg.loaded) {
      setStatus("Loading ffmpeg...");
      await ffmpeg.load();
    }
    const out = [];
    for (let i = 0; i < auds.length; i++) {
      const f = auds[i];
      setStatus(`Audio ${i+1}/${auds.length}: ${f.name}`);
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
      const blob = new Blob([data.buffer], { type: "audio/"+audioFormat });
      out.push({ name: f.name.replace(/\..+$/, "") + "." + audioFormat, blob, type: "audio/"+audioFormat });
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
      setStatus("Done.");
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setProcessing(false);
    }
  }

  async function downloadZip() {
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

  return (
    <div className="container">
      <h1 className="title">File Converter</h1>
      <p className="subtitle">Convert & enhance images or audio — all in browser</p>

      <div className="grid">
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
                  <input type="number" value={resizeWidth} onChange={e => setResizeWidth(parseInt(e.target.value)||"")} />
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
              <button type="button" onClick={() => {setFiles([]);setResults([]);}}>Reset</button>
            </div>

            <div className="small">Status: {status}</div>
          </form>
        </div>

        {/* ✅ Results Panel */}
        <div className="card">
          <h3>Results</h3>
          {results.length === 0 ? (
            <div className="small">No results yet</div>
          ) : (
            <>
              <div className="preview-list">
                {results.map((r,i)=>(
                  <div className="preview-item" key={i}>
                    {r.type.startsWith("image") ? (
                      <img src={r.url} alt={r.name} />
                    ) : (
                      <audio controls src={r.url} style={{width:150}} />
                    )}
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700}}>{r.name}</div>
                      <div className="meta">{(r.blob.size/1024).toFixed(1)} KB</div>
                      <a className="link" href={r.url} download={r.name}>Download</a>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:12,display:"flex",gap:8}}>
                <button onClick={downloadZip}>Download All (.zip)</button>
                <button onClick={()=>{results.forEach(r=>URL.revokeObjectURL(r.url));setResults([]);}}>Clear</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
