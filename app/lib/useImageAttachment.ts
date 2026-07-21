"use client";

import { useCallback, useEffect, useState } from "react";

// Dozwolone formaty i limit rozmiaru (z lekcji: PNG/JPG/GIF/WEBP, max 4MB).
export const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];
export const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export type AttachedImage = {
  dataUrl: string; // "data:image/png;base64,...."
  mediaType: string;
  name: string;
};

type Options = {
  // Gdy true — nasłuchuje Ctrl+V globalnie (na całym oknie), nie tylko w polu.
  globalPaste?: boolean;
};

/**
 * Reużywalna obsługa załączania obrazu: Ctrl+V, upload pliku, drag & drop
 * + walidacja formatu i rozmiaru. Używana na /vision oraz w istniejących czatach.
 */
export function useImageAttachment({ globalPaste = false }: Options = {}) {
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  // Wczytuje plik → base64, po drodze waliduje format i rozmiar.
  const readFile = useCallback((file: File) => {
    setError("");

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Nieobsługiwany format. Użyj PNG, JPG, GIF lub WEBP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Max 4MB. Zrób screenshot fragmentu.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImage({
        dataUrl: reader.result as string,
        mediaType: file.type,
        name: file.name || "obraz",
      });
    };
    reader.onerror = () => setError("Nie udało się wczytać pliku.");
    reader.readAsDataURL(file);
  }, []);

  // Wyciąga pierwszy obraz z listy itemów schowka / drag&drop.
  const imageFromItems = useCallback(
    (items: DataTransferItemList | null | undefined): File | null => {
      if (!items) return null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) return file;
        }
      }
      return null;
    },
    []
  );

  // --- Handlery dla React (pole tekstowe / obszar czatu) ---
  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const file = imageFromItems(e.clipboardData?.items);
      if (file) {
        e.preventDefault();
        readFile(file);
      }
    },
    [imageFromItems, readFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) readFile(file);
    },
    [readFile]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file);
      e.target.value = ""; // pozwól wybrać ten sam plik ponownie
    },
    [readFile]
  );

  const clear = useCallback(() => {
    setImage(null);
    setError("");
  }, []);

  // Globalny Ctrl+V — działa w dowolnym miejscu strony (nie trzeba klikać w pole).
  useEffect(() => {
    if (!globalPaste) return;
    const handler = (e: ClipboardEvent) => {
      const file = imageFromItems(e.clipboardData?.items);
      if (file) readFile(file);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [globalPaste, imageFromItems, readFile]);

  return {
    image,
    error,
    dragging,
    readFile,
    onPaste,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileInput,
    clear,
  };
}
