import { ref, uploadString, getDownloadURL, deleteObject, listAll } from "firebase/storage";
import { getFirebaseStorage } from "./config";
import { generateId } from "@/lib/utils";

export async function uploadBase64File(
  base64: string,
  fileName: string,
  mimeType: string,
  folder = "uploads"
): Promise<string> {
  const storage = getFirebaseStorage();
  const id = generateId("file");
  const ext = fileName.split(".").pop();
  const path = `${folder}/${id}.${ext}`;
  const storageRef = ref(storage, path);

  const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;
  await uploadString(storageRef, base64Data, "base64", { contentType: mimeType });
  return await getDownloadURL(storageRef);
}

export async function deleteFile(url: string): Promise<void> {
  const storage = getFirebaseStorage();
  const fileRef = ref(storage, url);
  await deleteObject(fileRef);
}
