/**
 * Конвертация PDF в массив base64-изображений (по одной на страницу).
 * Используется для загрузки банковских выписок в PDF.
 */
import * as pdfjsLib from 'pdfjs-dist';
// Worker из node_modules — Vite отдаёт его с того же origin (без CORS)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite ?url returns string
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export type PdfProgressCallback = (current: number, total: number) => void;

export async function pdfToBase64Images(
  file: File,
  onProgress?: PdfProgressCallback
): Promise<Array<{ base64: string; mime: string }>> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const result: Array<{ base64: string; mime: string }> = [];

  for (let i = 1; i <= numPages; i++) {
    onProgress?.(i, numPages);
    const page = await pdf.getPage(i);
    const scale = 2;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    const renderTask = page.render({ canvasContext: ctx, viewport });
    await renderTask.promise;
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    if (base64) {
      result.push({ base64, mime: 'image/png' });
    }
  }

  return result;
}
