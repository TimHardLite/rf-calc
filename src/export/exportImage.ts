// Экспорт диаграммы: SVG (вектор) и PNG (растр) для паспорта.
// Двухрежимно: в браузере — обычная загрузка; в десктоп-приложении Tauri —
// системный диалог «Сохранить как» (плагины dialog + fs), т.к. webview
// не выполняет браузерную загрузку файлов.

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function serialize(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(clone);
}

function browserDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** PNG-байты из SVG через canvas. */
function svgToPngBytes(svg: SVGSVGElement, scale: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const data = serialize(svg);
    const w = svg.viewBox.baseVal.width || svg.clientWidth;
    const h = svg.viewBox.baseVal.height || svg.clientHeight;
    const img = new Image();
    const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); return reject(new Error("no 2d context")); }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error("toBlob failed"));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("svg image load failed"));
    };
    img.src = url;
  });
}

async function saveTauri(filename: string, ext: string, bytes: Uint8Array | string) {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { writeFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
  const path = await save({
    defaultPath: filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!path) return; // отмена пользователем
  if (typeof bytes === "string") await writeTextFile(path, bytes);
  else await writeFile(path, bytes);
}

export async function exportSvg(svg: SVGSVGElement, filename: string) {
  const name = filename.endsWith(".svg") ? filename : filename + ".svg";
  const data = serialize(svg);
  if (isTauri()) {
    await saveTauri(name, "svg", data);
    return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml;charset=utf-8" }));
  browserDownload(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportPng(svg: SVGSVGElement, filename: string, scale = 3) {
  const name = filename.endsWith(".png") ? filename : filename + ".png";
  const bytes = await svgToPngBytes(svg, scale);
  if (isTauri()) {
    await saveTauri(name, "png", bytes);
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" }));
  browserDownload(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
