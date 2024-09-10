// Replace with your Azure Blob Storage SAS URL
const sasUrl = "https://spacejockey.blob.core.windows.net/redscarecdn?sv=2023-01-03&st=2024-09-10T22%3A22%3A41Z&se=2027-03-31T22%3A22%3A00Z&sr=c&sp=racwdl&sig=rS7Q52AA709%2F6%2FY4v4xg0B%2BSK79DHy1rf48bPmGyyIA%3D";

const { BlobServiceClient } = window.azureStorageBlob;

const blobServiceClient = new BlobServiceClient(sasUrl);
const containerClient = blobServiceClient.getContainerClient();

document.getElementById("uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  if (file) {
    const blockBlobClient = containerClient.getBlockBlobClient(file.name);
    await blockBlobClient.uploadBrowserData(file);
    alert("File uploaded successfully!");
    listFiles();
  }
});

async function listFiles() {
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";
  for await (const blob of containerClient.listBlobsFlat()) {
    const blobUrl = `${sasUrl.split("?")[0]}/${blob.name}`;
    const fileLink = document.createElement("a");
    fileLink.href = blobUrl;
    fileLink.textContent = blob.name;
    fileLink.download = blob.name;
    fileList.appendChild(fileLink);
    fileList.appendChild(document.createElement("br"));
  }
}

// Initial listing of files
listFiles();