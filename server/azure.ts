import { BlobServiceClient } from "@azure/storage-blob";

export function getBlobServiceClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING is required");
  return BlobServiceClient.fromConnectionString(conn);
}

export function getContainerName() {
  const container = process.env.AZURE_BLOB_CONTAINER;
  if (!container) throw new Error("AZURE_BLOB_CONTAINER is required");
  return container;
}
