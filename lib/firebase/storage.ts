// Storage adapter - TODO: Implement file storage
export async function uploadFile(file: File, path: string): Promise<string> {
  // TODO: Implement file storage (AWS S3, GCS, etc.)
  console.warn("uploadFile not yet implemented");
  return "";
}

export async function deleteFile(path: string): Promise<void> {
  // TODO: Implement
  console.warn("deleteFile not yet implemented");
}

export async function getFileUrl(path: string): Promise<string> {
  // TODO: Implement
  return "";
}
