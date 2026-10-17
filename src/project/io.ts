// Сохранение и открытие файлов проекта .irta.
// Двухрежимно, как и экспорт картинок: в Tauri — системные диалоги «Сохранить как» /
// «Открыть», в браузере — обычная загрузка и <input type="file">.

import {
  FILE_EXT, parseProject, projectFileName, serializeProject,
  type AntennaProject, type ProjectSchema,
} from "./format";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const FILTER = { name: "Проект антенны ИРТ", extensions: [FILE_EXT.replace(".", "")] };

/** Сохранить проект. Возвращает true, если файл записан (false — пользователь отменил). */
export async function saveProject(project: AntennaProject, schema?: ProjectSchema): Promise<boolean> {
  const text = serializeProject(project, schema);
  const filename = projectFileName(project.name);

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({ defaultPath: filename, filters: [FILTER] });
    if (!path) return false;
    await writeTextFile(path, text);
    return true;
  }

  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

/** Открыть проект. Возвращает null, если пользователь отменил выбор. */
export async function openProject(): Promise<AntennaProject | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({ multiple: false, filters: [FILTER] });
    if (!path || typeof path !== "string") return null;
    return parseProject(await readTextFile(path));
  }

  return new Promise<AntennaProject | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${FILE_EXT},text/plain`;
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(parseProject(String(reader.result)));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(new Error("не удалось прочитать файл"));
      reader.readAsText(file, "utf-8");
    };
    // Modern browsers emit cancel when the chooser closes without a selection.
    input.click();
  });
}
