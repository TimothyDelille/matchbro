// Browser-side upload to a Supabase Storage signed upload URL, with progress.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
export const BUCKET = "submissions";

export function uploadToSignedUrl(
  path: string,
  token: string,
  file: File,
  onProgress?: (loaded: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?token=${encodeURIComponent(token)}`;
    xhr.open("PUT", url);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || "Upload failed")));
    xhr.onerror = () => reject(new Error("network"));
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}

/** Parse a JSON response without crashing on an HTML error page. */
export async function readJson<T extends object>(res: Response): Promise<T & { error?: string }> {
  try {
    return await res.json();
  } catch {
    return { error: `Something went wrong on our side (${res.status}). Try again in a minute.` } as T & {
      error?: string;
    };
  }
}
