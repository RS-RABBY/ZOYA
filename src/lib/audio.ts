export function pcmToBase64(pcmData: Float32Array): string {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); // little-endian
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1024) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 1024)));
  }
  return btoa(binary);
}

export function base64ToPcm(base64: string): Float32Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const buffer = bytes.buffer;
  const view = new DataView(buffer);
  const pcmData = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < pcmData.length; i++) {
    pcmData[i] = view.getInt16(i * 2, true) / 32768;
  }
  return pcmData;
}
